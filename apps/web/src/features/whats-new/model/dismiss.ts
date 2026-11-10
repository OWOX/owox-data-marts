import { lastSeenRelease } from './last-seen-release';
import { trackWhatsNewEvent } from './whats-new.analytics';

/** The × of the What's new card: the user saw this release or does not want it. */
export function dismissWhatsNew(): void {
  const version = lastSeenRelease.dismissShown();
  if (version) trackWhatsNewEvent('whats_new_dismissed', version);
}
