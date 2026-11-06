import { trackEvent } from '../../../utils/data-layer';

const ACTIONS = {
  whats_new_shown: 'WhatsNewShown',
  whats_new_chapter_played: 'WhatsNewChapterPlayed',
  whats_new_changelog_opened: 'WhatsNewChangelogOpened',
  whats_new_postponed: 'WhatsNewPostponed',
} as const;

export type WhatsNewEvent = keyof typeof ACTIONS;

/**
 * Never throws: telemetry must not break the popover. The keys other events set are sent as
 * null, as GTM keeps the last value pushed for a key the push leaves out. The PostHog tag in
 * GTM forwards a fixed set of keys, so the properties also travel as JSON in `details`.
 */
export function trackWhatsNewEvent(
  event: WhatsNewEvent,
  version: string,
  properties: Record<string, unknown> = {}
): void {
  try {
    const own = { version, ...properties };
    trackEvent({
      event,
      category: 'WhatsNew',
      action: ACTIONS[event],
      label: version,
      context: null,
      value: null,
      error: null,
      ...own,
      details: JSON.stringify(own),
    });
  } catch {
    // ignore
  }
}
