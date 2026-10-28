import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { UninstallPluginCommand } from '../dto/domain/uninstall-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginActionExecutionService } from '../services/plugin-action-execution.service';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginInstallationService } from '../services/plugin-installation.service';
import {
  CREDENTIAL_CONSUMER_BINDING_FACADE,
  type CredentialConsumerBindingFacade,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';

/**
 * Stops a plugin for one member.
 *
 * Soft by design: the row and its history survive so the member can restore it later,
 * even if no publication makes the plugin visible by then. It changes no publication
 * and cannot reach another member's installation.
 *
 * Deliberately available while the plugin is suspended -- a member must always be able
 * to walk away from a plugin that has gone wrong.
 */
@Injectable()
export class UninstallPluginService {
  constructor(
    private readonly installations: PluginInstallationService,
    private readonly audit: PluginAuditService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly credentialBindings: CredentialConsumerBindingFacade,
    private readonly schedules: PluginActionScheduleService,
    private readonly executions: PluginActionExecutionService
  ) {}

  @Transactional()
  async run(command: UninstallPluginCommand): Promise<void> {
    const installation = await this.installations.findOne(
      command.pluginId,
      command.context.projectId,
      command.context.userId
    );

    if (!installation) {
      throw new NotFoundException('You do not have this plugin installed');
    }

    const wasUninstalled = installation.uninstalledAt !== null;
    if (!wasUninstalled) {
      await this.installations.uninstall(installation.id);
      await this.schedules.parkForInstallation(installation.id);
      // While a start limit holds the queue nothing fails these runs, and a restore would start them.
      await this.executions.cancelQueuedForInstallation(installation.id);
    }

    await this.credentialBindings.deactivateConsumer('plugin-installation', installation.id);

    await this.audit.record({
      pluginId: command.pluginId,
      action: PluginAuditAction.UNINSTALL,
      authorityScope: PluginPublicationScope.MEMBER,
      projectId: command.context.projectId,
      userId: command.context.userId,
      // Lets Plugin history hide a repeat uninstall, which removes nothing.
      beforeState: { uninstalled: wasUninstalled },
    });
  }
}
