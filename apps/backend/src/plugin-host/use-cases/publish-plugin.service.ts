import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { PluginPublicationDto } from '../dto/domain/plugin-publication.dto';
import { PluginSyncResultDto, SyncPluginReleasesCommand } from '../dto/domain/plugin-sync.dto';
import { DeploymentAudience, PublishPluginCommand } from '../dto/domain/publish-plugin.command';
import { PluginPublication } from '../entities/plugin-publication.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import {
  AudienceFormConflictError,
  NoEligiblePluginVersionError,
} from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { buildUniquenessKey } from '../utils/publication-uniqueness-key.util';
import { buildPublisherDiagnostics } from './plugin-publisher-diagnostics';
import { SyncPluginReleasesService } from './sync-plugin-releases.service';

/**
 * Makes a plugin discoverable in the Gallery at one authority level.
 *
 * Publishing controls listing only. It is not permission to install, and it never
 * touches anybody's installations. A listing without an eligible Release is refused so
 * the Gallery never shows something nobody can install.
 */
@Injectable()
export class PublishPluginService {
  constructor(
    private readonly authorization: PublicationAuthorizationService,
    private readonly sync: SyncPluginReleasesService,
    private readonly publications: PluginPublicationService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    private readonly audit: PluginAuditService,
    private readonly schedule: PluginUpdateScheduleService
  ) {}

  async run(command: PublishPluginCommand): Promise<PluginPublicationDto> {
    // Both checks are free. Doing them before synchronization means an unauthorized or
    // malformed request cannot make us spend GitHub calls on its behalf.
    this.authorization.assertMayManage(command.scope, command.context);
    const audience = this.readAudience(command.scope, command.audience);

    // Network I/O stays outside the transaction that commits the publication.
    const synced = await this.sync.run(new SyncPluginReleasesCommand(command.repoLocator));

    if (!synced.currentVersionId || !synced.currentSemver) {
      throw new NoEligiblePluginVersionError(
        synced.pluginId,
        synced.repository,
        synced.report.rejections
      );
    }

    const publication = await this.commitPublication(command, audience, synced);

    // Something now depends on this plugin being current, so it joins daily maintenance.
    // The freshness check the specification asks for is the synchronization above.
    await this.schedule.ensureScheduled(synced.pluginId);

    return publication;
  }

  @Transactional()
  private async commitPublication(
    command: PublishPluginCommand,
    audience: DeploymentAudience,
    synced: PluginSyncResultDto
  ): Promise<PluginPublicationDto> {
    const uniquenessKey = buildUniquenessKey({
      scope: command.scope,
      pluginId: synced.pluginId,
      projectId: this.projectIdFor(command),
      userId: this.userIdFor(command),
    });

    const existing = await this.publications.findByUniquenessKey(uniquenessKey);
    const publication = existing
      ? await this.restore(existing, command, audience)
      : await this.publications.create({
          pluginId: synced.pluginId,
          scope: command.scope,
          uniquenessKey,
          projectId: this.projectIdFor(command) ?? null,
          userId: this.userIdFor(command) ?? null,
          allProjects: audience.allProjects === true,
        });

    if (audience.projectIds?.length) {
      await this.publications.addToAudience(publication.id, audience.projectIds);
    }

    await this.audit.record({
      pluginId: synced.pluginId,
      action: PluginAuditAction.PUBLISH,
      authorityScope: command.scope,
      projectId: command.context.projectId,
      userId: command.context.userId,
      apiKeyId: command.context.apiKeyId ?? null,
      beforeState: existing
        ? { isActive: existing.isActive, allProjects: existing.allProjects }
        : null,
      afterState: { isActive: true, allProjects: audience.allProjects === true },
    });

    const activeAudience = await this.publications.listActiveAudience(publication.id);
    const plugin = await this.pluginService.findById(synced.pluginId);
    const version = synced.currentVersionId
      ? await this.versionService.findById(synced.currentVersionId)
      : null;

    return {
      publicationId: publication.id,
      pluginId: synced.pluginId,
      repository: synced.repository,
      scope: command.scope,
      isActive: true,
      allProjects: audience.allProjects === true,
      audienceProjectIds: activeAudience.map(row => row.projectId),
      currentSemver: synced.currentSemver,
      diagnostics: buildPublisherDiagnostics(plugin, version, synced.report),
    };
  }

  private async restore(
    existing: PluginPublication,
    command: PublishPluginCommand,
    audience: DeploymentAudience
  ): Promise<PluginPublication> {
    const wantsWildcard = audience.allProjects === true;

    // Converting between audience forms is an explicit two-step operation, in both
    // directions. Widening silently would hand a deliberately narrow audience the whole
    // deployment; narrowing silently would drop the plugin from every project except the
    // ones named in this one command, which is the more destructive of the two.
    if (existing.isActive && wantsWildcard !== existing.allProjects) {
      throw new AudienceFormConflictError(
        command.scope,
        wantsWildcard
          ? 'Unpublish the current deployment publication before republishing it to all projects'
          : 'This plugin is published to all projects. Unpublish it entirely, then republish it to the projects you want.'
      );
    }

    if (wantsWildcard) {
      // Without this, switching back to selected projects later would revive whatever
      // the audience happened to contain before the wildcard took over.
      await this.publications.removeFromAudience(existing.id);
    }

    await this.publications.activate(existing.id, wantsWildcard);
    return existing;
  }

  /** @throws {AudienceFormConflictError} */
  private readAudience(
    scope: PluginPublicationScope,
    audience: DeploymentAudience
  ): DeploymentAudience {
    const hasProjects = (audience.projectIds?.length ?? 0) > 0;
    const wantsWildcard = audience.allProjects === true;

    if (scope !== PluginPublicationScope.DEPLOYMENT) {
      if (hasProjects || wantsWildcard) {
        throw new AudienceFormConflictError(
          scope,
          'An audience can only be chosen for a deployment publication'
        );
      }
      return {};
    }

    if (hasProjects && wantsWildcard) {
      throw new AudienceFormConflictError(
        scope,
        'Choose either specific projects or all projects, not both'
      );
    }

    if (!hasProjects && !wantsWildcard) {
      throw new AudienceFormConflictError(
        scope,
        'Choose which projects this reaches: specific project ids, or all projects'
      );
    }

    return audience;
  }

  private projectIdFor(command: PublishPluginCommand): string | undefined {
    return command.scope === PluginPublicationScope.DEPLOYMENT
      ? undefined
      : command.context.projectId;
  }

  private userIdFor(command: PublishPluginCommand): string | undefined {
    return command.scope === PluginPublicationScope.MEMBER ? command.context.userId : undefined;
  }
}
