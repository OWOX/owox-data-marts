import { Injectable, Logger } from '@nestjs/common';
import { SyncPluginReleasesCommand, SyncReport } from '../dto/domain/plugin-sync.dto';
import { Plugin } from '../entities/plugin.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { SyncPluginReleasesService } from './sync-plugin-releases.service';

/** Who asked. The deployment owns activation either way; a member only accelerates it. */
export type PluginUpdateCheckTrigger = 'automatic' | 'member';

export type PluginUpdateCheckOutcome =
  /** A higher valid version was found and is now current for the whole deployment. */
  | 'updated'
  /** The check ran and found nothing higher. A normal outcome, not a failure. */
  | 'up_to_date'
  /** Another check for this plugin is recent or in flight; its result stands. */
  | 'already_running'
  /** GitHub was unreachable or the release was invalid. The current version is untouched. */
  | 'failed';

export interface PluginUpdateCheckResult {
  readonly pluginId: string;
  readonly repository: string;
  readonly outcome: PluginUpdateCheckOutcome;
  readonly currentVersionId: string | null;
  readonly currentSemver: string | null;
  /** Publisher diagnostics only; null when the check never reached GitHub. */
  readonly report: SyncReport | null;
}

export interface PluginUpdateCheckActor {
  readonly projectId?: string | null;
  readonly userId?: string | null;
  readonly apiKeyId?: string | null;
}

/**
 * One managed update check, however it was triggered.
 *
 * Both the daily schedule and **Check now** land here, because the rules are the same in
 * both cases: read the eligible Releases, take the highest valid version above the
 * current one, make it current once at plugin level for the entire deployment. What
 * differs is only who is recorded as having asked.
 *
 * Failure never replaces the current version, and never propagates as an error: an
 * unreachable GitHub is an outcome the member is told about, not a broken request.
 */
@Injectable()
export class RunPluginUpdateCheckService {
  private readonly logger = new Logger(RunPluginUpdateCheckService.name);

  constructor(
    private readonly sync: SyncPluginReleasesService,
    private readonly versionService: PluginVersionService,
    private readonly audit: PluginAuditService
  ) {}

  async run(
    plugin: Plugin,
    trigger: PluginUpdateCheckTrigger,
    actor: PluginUpdateCheckActor = {}
  ): Promise<PluginUpdateCheckResult> {
    const before = plugin.currentVersionId;
    const repository = `${plugin.repoOwner}/${plugin.repoName}`;

    // Deliberately not gated on suspension: a suspended plugin is exactly the one that
    // needs a corrective version to become current, and activating it does not resume it.
    // A stored first-sync state is allowed, so hitting the throttle is an outcome, not an error.
    let synced;
    try {
      synced = await this.sync.run(new SyncPluginReleasesCommand(repository, false));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Update check for ${repository} failed: ${detail}`);
      await this.record(plugin, trigger, actor, 'failed', before, before, detail);
      return {
        pluginId: plugin.id,
        repository,
        outcome: 'failed',
        currentVersionId: before,
        currentSemver: await this.semverOf(before),
        report: null,
      };
    }

    const outcome: PluginUpdateCheckOutcome = synced.throttled
      ? 'already_running'
      : synced.currentVersionId !== before
        ? 'updated'
        : 'up_to_date';

    await this.record(plugin, trigger, actor, outcome, before, synced.currentVersionId);

    return {
      pluginId: plugin.id,
      repository: synced.repository,
      outcome,
      currentVersionId: synced.currentVersionId,
      currentSemver: synced.currentSemver,
      report: synced.report,
    };
  }

  private semverOf(versionId: string | null): Promise<string | null> {
    return versionId
      ? this.versionService.findById(versionId).then(version => version?.semver ?? null)
      : Promise.resolve(null);
  }

  /**
   * Every check is recorded, not only the ones that changed something.
   *
   * A daily check that found nothing and a daily check that never reached GitHub look
   * identical from the outside, and telling them apart is the whole point of auditing
   * maintenance nobody asked for.
   */
  private async record(
    plugin: Plugin,
    trigger: PluginUpdateCheckTrigger,
    actor: PluginUpdateCheckActor,
    outcome: PluginUpdateCheckOutcome,
    before: string | null,
    after: string | null,
    failureDetail?: string
  ): Promise<void> {
    await this.audit.record({
      pluginId: plugin.id,
      action: outcome === 'updated' ? PluginAuditAction.UPDATE : PluginAuditAction.UPDATE_CHECK,
      // The deployment activates; a member only asks for it sooner.
      authorityScope:
        trigger === 'automatic' ? PluginPublicationScope.DEPLOYMENT : PluginPublicationScope.MEMBER,
      projectId: actor.projectId ?? null,
      userId: actor.userId ?? null,
      apiKeyId: actor.apiKeyId ?? null,
      beforeState: { currentVersionId: before },
      afterState: {
        currentVersionId: after,
        trigger,
        outcome,
        // GitHub reports failures in its response body, never in credentials we sent.
        ...(failureDetail ? { failureDetail } : {}),
      },
    });
  }
}
