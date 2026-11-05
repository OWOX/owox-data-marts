import { storageService } from '../../../services/localstorage.service';

const KEY_PREFIX = 'whats-new-last-seen-release:';

/** The last release announced to a user in this browser. */
export const lastSeenRelease = {
  get(userId: string): string | null {
    return storageService.get(KEY_PREFIX + userId);
  },
  set(userId: string, version: string): void {
    storageService.set(KEY_PREFIX + userId, version);
  },
};
