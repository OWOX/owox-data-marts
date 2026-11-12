import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { InstallPluginCommand } from '../dto/domain/install-plugin.command';
import { PluginInstallationDto } from '../dto/domain/plugin-installation.dto';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginSuspendedError, StaleVersionConfirmationError } from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { RunPluginUpdateCheckService } from './run-plugin-update-check.service';
import {
  CREDENTIAL_CONSUMER_BINDING_FACADE,
  type CredentialConsumerBindingFacade,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';
import {
  OWOX_AI_FACADE,
  OWOX_AI_SELECTION,
  type OwoxAiFacade,
} from '../../data-marts/credentials/facades/owox-ai.facade';
import { logicalAiRequirement, withoutRequirement } from '../utils/owox-ai-requirement.util';

/**
 * Installs a plugin for one member in one project.
 *
 * Installing is independent of publishing: a member reaching the plugin by direct link
 * can install it with no publication in sight, and installing never creates one. Each
 * member's installation is their own, so nothing here can affect anybody else.
 */
@Injectable()
export class InstallPluginService {
  constructor(
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    private readonly installations: PluginInstallationService,
    private readonly audit: PluginAuditService,
    private readonly schedule: PluginUpdateScheduleService,
    private readonly check: RunPluginUpdateCheckService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly credentialBindings: CredentialConsumerBindingFacade,
    @Inject(OWOX_AI_FACADE) private readonly owoxAi: OwoxAiFacade
  ) {}

  /**
   * Outside the transaction on purpose: a plugin nobody publishes or installs is off
   * daily maintenance, so its recorded release may be months stale, and installing it is
   * the moment to find out. That check talks to GitHub, which has no business holding a
   * database transaction open -- and its result reaches the member through the ordinary
   * stale-confirmation path, which asks them again with whatever version is current now.
   */
  async run(command: InstallPluginCommand): Promise<PluginInstallationDto> {
    if (await this.schedule.ensureScheduled(command.pluginId)) {
      const plugin = await this.pluginService.findById(command.pluginId);
      if (plugin) {
        await this.check.run(plugin, 'automatic');
      }
    }

    return this.commit(command);
  }

  @Transactional()
  private async commit(command: InstallPluginCommand): Promise<PluginInstallationDto> {
    const plugin = await this.pluginService.findById(command.pluginId);
    if (!plugin) {
      throw new NotFoundException(`Plugin ${command.pluginId} was not found`);
    }

    if (plugin.suspendedAt !== null) {
      throw new PluginSuspendedError(plugin.id);
    }

    if (!plugin.currentVersionId) {
      throw new BadRequestException('This plugin has no version available to install yet');
    }

    // Any installed member can move a plugin forward at any moment, so the version the
    // member read about may already be gone. Reject rather than install something they
    // never saw; the new version travels back so the screen can ask again.
    if (command.expectedVersionId !== plugin.currentVersionId) {
      const current = await this.versionService.findById(plugin.currentVersionId);
      throw new StaleVersionConfirmationError(plugin.currentVersionId, current?.semver ?? null);
    }

    const existing = await this.installations.findOne(
      plugin.id,
      command.context.projectId,
      command.context.userId
    );

    // Losing the insert race lands here as `wonRace: false`, and is then treated exactly
    // as a repeat install: restore() no-ops on an active row, so a double-click answers
    // the same as the sequential second request would have.
    let firstInstall = false;
    let wasUninstalled = false;
    let installation: PluginInstallation;
    if (existing) {
      wasUninstalled = existing.uninstalledAt !== null;
      installation = await this.restore(existing);
    } else {
      const claimed = await this.installations.installOrFind(
        plugin.id,
        command.context.projectId,
        command.context.userId
      );
      firstInstall = claimed.wonRace;
      wasUninstalled = claimed.installation.uninstalledAt !== null;
      installation = claimed.wonRace
        ? claimed.installation
        : await this.restore(claimed.installation);
    }

    const version = await this.versionService.findById(plugin.currentVersionId);
    if (!version) {
      throw new BadRequestException('This plugin has no version available to install yet');
    }

    const requirements = version.credentialRequirements ?? [];
    const selections = command.credentialSelections;
    const ai = logicalAiRequirement(requirements);
    // OWOX AI can only stand in for the logical requirement, never for an exact one.
    const wrongKey = Object.keys(selections).find(
      key => selections[key] === OWOX_AI_SELECTION && key !== ai?.normalized.key
    );
    if (wrongKey) {
      throw new BadRequestException(`OWOX AI cannot be selected for "${wrongKey}"`);
    }
    const useOwoxAi = ai !== null && selections[ai.normalized.key] === OWOX_AI_SELECTION;
    if (useOwoxAi && !this.owoxAi.provides(ai.normalized.models)) {
      throw new BadRequestException('OWOX AI does not provide every model this plugin needs');
    }

    await this.credentialBindings.replaceBindings({
      projectId: command.context.projectId,
      userId: command.context.userId,
      roles: command.context.roles ?? [],
      consumerType: 'plugin-installation',
      consumerId: installation.id,
      requirements: useOwoxAi ? withoutRequirement(requirements, ai.normalized.key) : requirements,
      selections: useOwoxAi
        ? Object.fromEntries(
            Object.entries(selections).filter(([key]) => key !== ai.normalized.key)
          )
        : selections,
    });
    await this.installations.setOwoxAi(installation.id, useOwoxAi);

    await this.audit.record({
      pluginId: plugin.id,
      // Distinguished on purpose: a member returning to a plugin they had removed is a
      // different event from a first grant of their authority to a third party.
      action: firstInstall ? PluginAuditAction.INSTALL : PluginAuditAction.RESTORE,
      authorityScope: PluginPublicationScope.MEMBER,
      projectId: command.context.projectId,
      userId: command.context.userId,
      // Lets Plugin history hide a repeat install of an active row, which restores nothing.
      ...(firstInstall ? {} : { beforeState: { uninstalled: wasUninstalled } }),
      afterState: { versionId: plugin.currentVersionId },
    });

    return {
      installationId: installation.id,
      pluginId: installation.pluginId,
      // Preserved across every uninstall and restore, so it keeps meaning "first ever".
      createdAt: installation.createdAt,
      installedAt: installation.installedAt,
      uninstalledAt: installation.uninstalledAt,
    };
  }

  private async restore(existing: PluginInstallation): Promise<PluginInstallation> {
    if (existing.uninstalledAt === null) {
      return existing;
    }

    await this.installations.restore(existing.id);
    return (await this.installations.findById(existing.id)) ?? existing;
  }
}
