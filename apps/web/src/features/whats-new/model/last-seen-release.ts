import { storageService } from '../../../services/localstorage.service';

const KEY_PREFIX = 'whats-new-last-seen-release:';

/** What the card replaced when it opened in this app load, so Later can put it back. */
let shownInThisLoad: { userId: string; previous: string | null } | null = null;

function get(userId: string): string | null {
  return storageService.get(KEY_PREFIX + userId);
}

/** The last release announced to a user in this browser. */
export const lastSeenRelease = {
  get,

  /** The card opened for this release: it does not open again unless the user postpones it. */
  markShown(userId: string, version: string): void {
    shownInThisLoad = { userId, previous: get(userId) };
    storageService.set(KEY_PREFIX + userId, version);
  },

  /** Later: the card opens again on the next app load. */
  postpone(): void {
    if (!shownInThisLoad) return;
    const { userId, previous } = shownInThisLoad;
    shownInThisLoad = null;
    if (previous === null) storageService.remove(KEY_PREFIX + userId);
    else storageService.set(KEY_PREFIX + userId, previous);
  },
};
