import { storageService } from '../../../services/localstorage.service';
import { compareVersions } from './release-version';

const KEY_PREFIX = 'whats-new-last-seen-release:';

/** The release the card shows in this app load, recorded only when the user closes the card. */
let shownInThisLoad: { userId: string; version: string } | null = null;

function get(userId: string): string | null {
  return storageService.get(KEY_PREFIX + userId);
}

/** The last release a user closed the card for, in this browser. */
export const lastSeenRelease = {
  get,

  /** The card opened for this release. It keeps opening on every app load until it is closed. */
  markShown(userId: string, version: string): void {
    shownInThisLoad = { userId, version };
  },

  /**
   * The user closed the card: this release does not open it again. Returns its version. A tab
   * left open since an older release keeps a newer record that another tab already wrote.
   */
  dismissShown(): string | null {
    if (!shownInThisLoad) return null;
    const { userId, version } = shownInThisLoad;
    shownInThisLoad = null;
    const stored = get(userId);
    if (!stored || (compareVersions(version, stored) ?? 1) > 0) {
      storageService.set(KEY_PREFIX + userId, version);
    }
    return version;
  },
};
