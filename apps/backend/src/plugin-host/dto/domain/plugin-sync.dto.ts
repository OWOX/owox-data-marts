import { z } from 'zod';
import { GithubAccessMode } from '../../enums/github-access-mode.enum';
import { ReleaseRejectionCode } from '../../enums/release-rejection-code.enum';

export const ReleaseRejectionSchema = z.object({
  tagName: z.string(),
  githubReleaseId: z.string().nullable(),
  code: z.nativeEnum(ReleaseRejectionCode),
  /** Free text for publishers only. Never reaches a member-facing response. */
  detail: z.string(),
});

/**
 * Outcome of one synchronization pass, stored on the plugin.
 *
 * Ineligible Releases are recorded here rather than as rows with a status column.
 * That makes "an invalid Release never replaces a working current version" structural
 * instead of branch-enforced, and lets a publisher fix a broken 1.2.0 by re-tagging
 * without a stored failure blocking them forever.
 */
export const SyncReportSchema = z.object({
  syncedAt: z.string(),
  accessMode: z.nativeEnum(GithubAccessMode),
  /** Newly recorded in this pass. */
  acceptedSemvers: z.array(z.string()),
  /** Already recorded with an identical Release and commit, so skipped. */
  unchangedSemvers: z.array(z.string()),
  rejections: z.array(ReleaseRejectionSchema),
});

export type ReleaseRejectionDto = z.infer<typeof ReleaseRejectionSchema>;
export type SyncReport = z.infer<typeof SyncReportSchema>;

export interface PluginSyncResultDto {
  readonly pluginId: string;
  readonly githubRepoId: string;
  /** Canonical `owner/name` as GitHub reports it now, not as the caller spelled it. */
  readonly repository: string;
  readonly currentSemver: string | null;
  readonly currentVersionId: string | null;
  readonly report: SyncReport;
  /**
   * True when the per-plugin throttle turned this into a no-op and the values above are
   * the stored ones.
   */
  readonly throttled: boolean;
}

export class SyncPluginReleasesCommand {
  constructor(
    readonly repoLocator: string,
    /**
     * Publishing requires an already validated version when a sync is throttled. Background
     * sweeps can quietly return an empty stored state while a first sync is still running.
     */
    readonly requireCurrentVersion: boolean = true
  ) {}
}
