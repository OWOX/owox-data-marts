import { Injectable } from '@nestjs/common';
import { ListPublicationsCommand } from '../dto/domain/list-publications.command';
import { PluginPublicationDto } from '../dto/domain/plugin-publication.dto';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { buildPublisherDiagnostics } from './plugin-publisher-diagnostics';

/**
 * The publications the caller may manage at one scope.
 *
 * Scoping is applied by filter, not by trimming a wider result afterwards: a member
 * never loads another member's publications, so there is nothing to accidentally leak.
 */
@Injectable()
export class ListPublicationsService {
  constructor(
    private readonly authorization: PublicationAuthorizationService,
    private readonly publications: PluginPublicationService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService
  ) {}

  async run(command: ListPublicationsCommand): Promise<PluginPublicationDto[]> {
    this.authorization.assertMayManage(command.scope, command.context);

    const rows = await this.publications.listManageable(command.scope, {
      // Deployment publications are not bound to a project, and any allowlisted key may
      // manage all of them. The other two scopes are narrowed to the caller.
      projectId:
        command.scope === PluginPublicationScope.DEPLOYMENT ? undefined : command.context.projectId,
      userId: command.scope === PluginPublicationScope.MEMBER ? command.context.userId : undefined,
    });

    return Promise.all(rows.map(row => this.toDto(row.id, row)));
  }

  private async toDto(
    publicationId: string,
    row: {
      pluginId: string;
      scope: PluginPublicationScope;
      isActive: boolean;
      allProjects: boolean;
    }
  ): Promise<PluginPublicationDto> {
    const [audience, plugin] = await Promise.all([
      this.publications.listActiveAudience(publicationId),
      this.pluginService.findById(row.pluginId),
    ]);

    const currentVersion = plugin?.currentVersionId
      ? await this.versionService.findById(plugin.currentVersionId)
      : null;

    return {
      publicationId,
      pluginId: row.pluginId,
      // Empty only if the plugin row vanished under us, which the audit trail forbids.
      repository: plugin ? `${plugin.repoOwner}/${plugin.repoName}` : '',
      scope: row.scope,
      isActive: row.isActive,
      allProjects: row.allProjects,
      audienceProjectIds: audience.map(item => item.projectId),
      currentSemver: currentVersion?.semver ?? null,
      diagnostics: buildPublisherDiagnostics(plugin, currentVersion),
    };
  }
}
