import { compareVersions } from './release-version';
import type { AnnouncedRelease } from './types';

/**
 * The newest announced release that the running app already contains.
 *
 * OWOX Cloud runs snapshots versioned one minor ahead of the latest release, such as
 * `0.42.0-next-…` after 0.41.0, so 0.41.0 qualifies there and 0.42.0 does not yet. A self-hosted
 * app on 0.39.0 is not told about features it does not have. With no known running version,
 * the newest announced release is used.
 */
export function pickReleaseToAnnounce(
  releases: readonly AnnouncedRelease[],
  runningVersion: string | null
): AnnouncedRelease | null {
  let newest: AnnouncedRelease | null = null;
  for (const release of releases) {
    if (runningVersion) {
      const comparedToRunning = compareVersions(release.version, runningVersion);
      if (comparedToRunning === null || comparedToRunning > 0) continue;
    }
    if (!newest || (compareVersions(release.version, newest.version) ?? 0) > 0) {
      newest = release;
    }
  }
  return newest;
}

/**
 * `show`: open the popover and remember the release. `remember`: remember the release without
 * showing it, so a new user starts from the onboarding rather than from release news.
 * `none`: the user already saw this release or a newer one.
 */
export type AnnouncementDecision = 'show' | 'remember' | 'none';

export function decideAnnouncement({
  releaseVersion,
  lastSeenVersion,
  hasUsedProduct,
}: {
  releaseVersion: string;
  /** The last release this user was shown in this browser, if any. */
  lastSeenVersion: string | null;
  /** The project already has a Data Mart, so this is not the user's first visit. */
  hasUsedProduct: boolean;
}): AnnouncementDecision {
  const comparedToLastSeen = lastSeenVersion
    ? compareVersions(releaseVersion, lastSeenVersion)
    : null;
  if (comparedToLastSeen === null) return hasUsedProduct ? 'show' : 'remember';
  return comparedToLastSeen > 0 ? 'show' : 'none';
}
