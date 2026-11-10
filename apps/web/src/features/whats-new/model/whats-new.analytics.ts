import { trackEvent } from '../../../utils/data-layer';

const ACTIONS = {
  whats_new_shown: 'WhatsNewShown',
  whats_new_chapter_played: 'WhatsNewChapterPlayed',
  whats_new_changelog_opened: 'WhatsNewChangelogOpened',
  whats_new_dismissed: 'WhatsNewDismissed',
} as const;

export type WhatsNewEvent = keyof typeof ACTIONS;

/**
 * Never throws: telemetry must not break the popover. The keys other events set are sent as
 * null, as GTM keeps the last value pushed for a key the push leaves out. For the same reason
 * the properties travel only as JSON in `details`, which the PostHog tag in GTM forwards: a
 * top-level key of its own would stay in GTM for every later event.
 */
export function trackWhatsNewEvent(
  event: WhatsNewEvent,
  version: string,
  properties: Record<string, unknown> = {}
): void {
  try {
    trackEvent({
      event,
      category: 'WhatsNew',
      action: ACTIONS[event],
      label: version,
      context: null,
      value: null,
      error: null,
      details: JSON.stringify({ version, ...properties }),
    });
  } catch {
    // ignore
  }
}
