import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { PluginPublicationDto } from '../dto/domain/plugin-publication.dto';
import { UnpublishPluginCommand } from '../dto/domain/publish-plugin.command';
import { Plugin } from '../entities/plugin.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { AudienceFormConflictError, PluginNotPublishedError } from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { parseGithubRepoLocator } from '../utils/github-repo-locator.util';
import { buildUniquenessKey } from '../utils/publication-uniqueness-key.util';
import { buildPublisherDiagnostics } from './plugin-publisher-diagnostics';

/**
 * Removes one reason for a plugin to appear in the Gallery.
 *
 * Catalog-only, and deliberately so. It does not uninstall anyone, does not suspend the
 * plugin, and other publications may keep it visible. Nothing is deleted either, so
 * republishing restores this record rather than creating a second one.
 *
 * Never calls GitHub: taking a listing down must work when the repository is
 * unreachable, exactly like the emergency kill switch.
 */
@Injectable()
export class UnpublishPluginService {
  constructor(
    private readonly authorization: PublicationAuthorizationService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    private readonly publications: PluginPublicationService,
    private readonly audit: PluginAuditService
  ) {}

  async run(command: UnpublishPluginCommand): Promise<PluginPublicationDto> {
    this.authorization.assertMayManage(command.scope, command.context);

    const ref = parseGithubRepoLocator(command.repoLocator);
    // Cached lookup only: unpublish is a local catalog op, not a GitHub one.
    const plugin = await this.pluginService.findByRepoName(ref.owner, ref.name);
    if (!plugin) {
      throw new PluginNotPublishedError(command.scope);
    }

    return this.commitUnpublish(command, plugin);
  }

  @Transactional()
  private async commitUnpublish(
    command: UnpublishPluginCommand,
    plugin: Plugin
  ): Promise<PluginPublicationDto> {
    const uniquenessKey = buildUniquenessKey({
      scope: command.scope,
      pluginId: plugin.id,
      projectId:
        command.scope === PluginPublicationScope.DEPLOYMENT ? undefined : command.context.projectId,
      userId: command.scope === PluginPublicationScope.MEMBER ? command.context.userId : undefined,
    });

    const publication = await this.publications.findByUniquenessKey(uniquenessKey);
    if (!publication) {
      throw new PluginNotPublishedError(command.scope);
    }

    const removesProjects = (command.audience.projectIds?.length ?? 0) > 0;

    // The wildcard reaches every current and future project; excluding one would need an
    // exclusion concept the model does not have. Refuse rather than quietly no-op.
    if (removesProjects && publication.allProjects) {
      throw new AudienceFormConflictError(
        command.scope,
        'This plugin is published to all projects. Unpublish it entirely, then republish it to the projects you want.'
      );
    }

    let isActive = publication.isActive;

    if (removesProjects) {
      await this.publications.removeFromAudience(publication.id, command.audience.projectIds);
      const remaining = await this.publications.listActiveAudience(publication.id);
      if (remaining.length === 0) {
        await this.publications.deactivate(publication.id);
        isActive = false;
      }
    } else {
      await this.publications.deactivate(publication.id);
      isActive = false;
    }

    await this.audit.record({
      pluginId: plugin.id,
      action: PluginAuditAction.UNPUBLISH,
      authorityScope: command.scope,
      projectId: command.context.projectId,
      userId: command.context.userId,
      apiKeyId: command.context.apiKeyId ?? null,
      beforeState: { isActive: publication.isActive, allProjects: publication.allProjects },
      afterState: { isActive },
    });

    const audience = await this.publications.listActiveAudience(publication.id);
    const version = plugin.currentVersionId
      ? await this.versionService.findById(plugin.currentVersionId)
      : null;

    return {
      publicationId: publication.id,
      pluginId: plugin.id,
      repository: `${plugin.repoOwner}/${plugin.repoName}`,
      scope: command.scope,
      isActive,
      allProjects: publication.allProjects,
      audienceProjectIds: audience.map(row => row.projectId),
      currentSemver: version?.semver ?? null,
      diagnostics: buildPublisherDiagnostics(plugin, version),
    };
  }
}
