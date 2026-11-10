import { compareVersions } from './release-version';
import type { AnnouncedRelease } from './types';

/**
 * A release whose what's-new video is not out this long after it shipped is announced without
 * it. The video usually follows the release within a day, and a card shown before it arrives
 * would keep users from ever seeing it.
 */
export const ANNOUNCE_WITHOUT_VIDEO_AFTER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Its video is out, or it shipped long enough ago without one and has changes to list. */
function isReadyToAnnounce(release: AnnouncedRelease, now: number): boolean {
  if (release.videoUrl) return true;
  if (!release.releasedAt || release.changes.length === 0) return false;
  return now - Date.parse(release.releasedAt) >= ANNOUNCE_WITHOUT_VIDEO_AFTER_DAYS * DAY_MS;
}

/**
 * The newest release that is ready to announce and that the running app already contains.
 *
 * OWOX Cloud runs snapshots versioned one minor ahead of the latest release, such as
 * `0.42.0-next-…` after 0.41.0, so 0.41.0 qualifies there and 0.42.0 does not yet. A self-hosted
 * app on 0.39.0 is not told about features it does not have. With no known running version,
 * the newest ready release is used.
 */
export function pickReleaseToAnnounce(
  releases: readonly AnnouncedRelease[],
  runningVersion: string | null,
  now: number = Date.now()
): AnnouncedRelease | null {
  let newest: AnnouncedRelease | null = null;
  for (const release of releases) {
    if (!isReadyToAnnounce(release, now)) continue;
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
 * Whether to open the card for this release. A release newer than the last one shown opens it.
 * With nothing shown in this browser yet, it opens only once the project has a Data Mart, so a
 * new user starts with the onboarding; nothing is stored then, so the release still opens
 * later, here or in another project that has a Data Mart.
 */
export function shouldAnnounce({
  releaseVersion,
  lastSeenVersion,
  hasUsedProduct,
}: {
  releaseVersion: string;
  /** The last release shown to this user in this browser, if any. */
  lastSeenVersion: string | null;
  /** The current project already has a Data Mart. */
  hasUsedProduct: boolean;
}): boolean {
  const comparedToLastSeen = lastSeenVersion
    ? compareVersions(releaseVersion, lastSeenVersion)
    : null;
  if (comparedToLastSeen === null) return hasUsedProduct;
  return comparedToLastSeen > 0;
}
