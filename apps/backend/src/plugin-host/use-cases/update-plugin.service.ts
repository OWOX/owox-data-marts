import { Injectable, NotFoundException } from '@nestjs/common';
import { PluginPublisherDiagnosticsDto } from '../dto/domain/plugin-publication.dto';
import { PluginUpdateResultDto, UpdatePluginCommand } from '../dto/domain/update-plugin.command';
import { Plugin } from '../entities/plugin.entity';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginService } from '../services/plugin.service';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { parseGithubRepoLocator } from '../utils/github-repo-locator.util';
import { buildPublisherDiagnostics } from './plugin-publisher-diagnostics';
import { RunPluginUpdateCheckService } from './run-plugin-update-check.service';

/**
 * **Check now**: a member asking for the deployment's next update check to happen at once.
 *
 * It accelerates maintenance that is already scheduled and inevitable; it does not choose
 * a version, decide whether an update happens, or move the plugin's daily slot. Whatever
 * it finds becomes current for every installation of that plugin across the deployment --
 * that is the deployment's single current version, not this member's preference.
 *
 * Any project member who can reach the plugin page may ask. Requiring an installation
 * would only make the same inevitable check happen later, for a plugin the member is
 * standing in front of.
 *
 * "Can reach" is carried by the plugin id, which is a random uuid nobody guesses. The
 * by-repository form has no such protection -- `owner/name` is guessable -- so that form
 * is narrowed to callers the plugin is already reachable by.
 */
@Injectable()
export class UpdatePluginService {
  constructor(
    private readonly pluginService: PluginService,
    private readonly authorization: PublicationAuthorizationService,
    private readonly schedule: PluginUpdateScheduleService,
    private readonly check: RunPluginUpdateCheckService,
    private readonly versionService: PluginVersionService,
    private readonly publications: PluginPublicationService,
    private readonly installations: PluginInstallationService
  ) {}

  async run(command: UpdatePluginCommand): Promise<PluginUpdateResultDto> {
    const plugin = await this.resolvePlugin(command);

    // A plugin off daily maintenance is exactly the one whose recorded release may be
    // stale, and asking about it is a reason to put it back on the schedule.
    await this.schedule.ensureScheduled(plugin.id);

    const result = await this.check.run(plugin, 'member', {
      projectId: command.context.projectId,
      userId: command.context.userId,
      apiKeyId: command.context.apiKeyId ?? null,
    });

    // Diagnostics only for publishers: rejection detail is a source diagnostic and must
    // not reach ordinary members on the same operation (§6.2 / §16). "Publisher" here
    // includes anyone managing a publication of this plugin -- GET /publications already
    // hands the same diagnostics block to exactly those callers, and without it a
    // member-scope publisher pressing Check now is told everything is fine while their
    // release was just rejected.
    const isPublisher = this.authorization.isDeploymentPublisher(command.context);
    const managesPublication =
      isPublisher || (await this.managesPublicationOf(plugin.id, command.context));
    let diagnostics: PluginPublisherDiagnosticsDto | null = null;
    if (managesPublication) {
      const version = result.currentVersionId
        ? await this.versionService.findById(result.currentVersionId)
        : null;
      const refreshed = await this.pluginService.findById(plugin.id);
      diagnostics = buildPublisherDiagnostics(refreshed, version, result.report);
    }

    const scheduled = await this.pluginService.findById(plugin.id);

    return {
      pluginId: result.pluginId,
      repository: visibleRepository(scheduled ?? plugin, result.repository, isPublisher),
      currentVersionId: result.currentVersionId,
      currentSemver: result.currentSemver,
      outcome: result.outcome,
      updated: result.outcome === 'updated',
      nextCheckAt: scheduled?.nextUpdateCheckAt?.toISOString() ?? null,
      diagnostics,
    };
  }

  private async resolvePlugin(command: UpdatePluginCommand): Promise<Plugin> {
    if (command.pluginId) {
      const plugin = await this.pluginService.findById(command.pluginId);
      if (!plugin) {
        throw new NotFoundException(`Plugin ${command.pluginId} was not found`);
      }
      return plugin;
    }

    if (command.repoLocator) {
      const ref = parseGithubRepoLocator(command.repoLocator);
      // Cache-first: CLI update addresses a plugin this deployment already knows. A
      // repository never seen here has nothing to update.
      const plugin = await this.pluginService.findByRepoName(ref.owner, ref.name);

      // One answer for "no such plugin" and "not yours to reach". A repository name is
      // guessable in a way a plugin id is not, so distinguishing the two would let any
      // member of any project probe which repositories this deployment hosts -- and a
      // member-scope publication is meant to be nobody else's business.
      if (!plugin || !(await this.mayReach(plugin.id, command.context))) {
        throw new NotFoundException(
          `Plugin ${ref.owner}/${ref.name} was not found on this deployment`
        );
      }
      return plugin;
    }

    throw new NotFoundException('A plugin id or repository is required');
  }

  /**
   * Whether the caller manages a publication of this plugin, mirroring the scope rules
   * `ListPublicationsService` enforces: project scope for Project Admins, member scope
   * for the caller's own listings. Deployment scope is handled by the allowlist check.
   */
  private async managesPublicationOf(
    pluginId: string,
    context: AuthorizationContext
  ): Promise<boolean> {
    const scopes: PluginPublicationScope[] = [];
    if (context.roles?.includes('admin')) {
      scopes.push(PluginPublicationScope.PROJECT);
    }
    if (context.userId) {
      scopes.push(PluginPublicationScope.MEMBER);
    }

    for (const scope of scopes) {
      const rows = await this.publications.listManageable(scope, {
        projectId: context.projectId,
        userId: scope === PluginPublicationScope.MEMBER ? (context.userId ?? undefined) : undefined,
      });
      if (rows.some(row => row.pluginId === pluginId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Whether this plugin is already reachable by the caller without guessing.
   *
   * A visible publication or the caller's own installation -- including a soft-uninstalled
   * one, which is what the history page restores from. Deployment publishers manage every
   * plugin by definition, which is how `owox-ctl plugins update` keeps working.
   */
  private async mayReach(pluginId: string, context: AuthorizationContext): Promise<boolean> {
    if (this.authorization.isDeploymentPublisher(context)) {
      return true;
    }

    const visible = await this.publications.findVisibleTo(context.projectId, context.userId);
    if (visible.some(row => row.pluginId === pluginId)) {
      return true;
    }

    const installation = await this.installations.findOne(
      pluginId,
      context.projectId,
      context.userId
    );

    return installation !== null;
  }
}

/**
 * Withholds a private repository's name from anyone but a deployment publisher.
 *
 * `PluginPresentationMapper.toSource` hides that name on the plugin view precisely because
 * it "would confirm to a member that one specific private repository exists" -- and
 * **Check now** sits on that same page, available to any viewer with no installation. The
 * owner stays, matching what `toSource` does disclose.
 */
function visibleRepository(plugin: Plugin, repository: string, isPublisher: boolean): string {
  return plugin.isPrivateRepo && !isPublisher ? `${plugin.repoOwner}/***` : repository;
}
