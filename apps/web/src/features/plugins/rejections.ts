import type { PluginPublication } from './types';

export type ReleaseRejection = NonNullable<PluginPublication['diagnostics']>['rejections'][number];

/**
 * Rejections that are permanent by design rather than fixable: drafts and prerelease
 * markers keep a release out of the Gallery deliberately. A repository full of release
 * candidates would repeat them on every check, burying the one entry that matters, so
 * the issues card shows only what the publisher can act on.
 *
 * Mirrors PUBLISHER_ACTIONABLE_REJECTION_CODES on the backend, inverted: an unknown
 * code from a newer backend is shown rather than hidden.
 */
const BY_DESIGN_CODES = new Set([
  'DRAFT',
  'PRERELEASE_FLAG',
  'PRERELEASE_TAG',
  'BUILD_METADATA_TAG',
  'INVALID_TAG',
]);

export interface ReleaseIssues {
  /** When the deployment last read the repository's releases. */
  syncedAt: string | null;
  rejections: ReleaseRejection[];
}

/** The subset of rejections a publisher can act on, in the report's order. */
export function actionableRejections(rejections: ReleaseRejection[]): ReleaseRejection[] {
  return rejections.filter(rejection => !BY_DESIGN_CODES.has(rejection.code));
}

/**
 * The publisher-fixable rejections from a plugin's publications, or null when there is
 * nothing to show.
 *
 * Diagnostics ride only on management responses, so a non-publisher never reaches a
 * card built from this. Every publication of one plugin carries the same sync report;
 * the first one that has it is as good as any.
 */
export function findReleaseIssues(publications: PluginPublication[]): ReleaseIssues | null {
  const diagnostics = publications.find(
    publication => publication.diagnostics !== undefined
  )?.diagnostics;
  if (!diagnostics) {
    return null;
  }

  const rejections = actionableRejections(diagnostics.rejections);
  if (rejections.length === 0) {
    return null;
  }

  return { syncedAt: diagnostics.syncedAt, rejections };
}
