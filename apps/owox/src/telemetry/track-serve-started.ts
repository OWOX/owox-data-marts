import { EventBus, PostHogTransport, resolvePostHogConfig } from '@owox/internal-helpers';

import { getOrCreateAnonymousId } from './anonymous-id.js';
import { ServeStartedEvent, type ServeStartedPayload } from './events/serve-started.event.js';
import { isTelemetryEnabled } from './is-telemetry-enabled.js';

const DOCS_URL = 'https://docs.owox.com/docs/editions/self-managed-editions/';

export interface TrackServeStartedOptions {
  /** Directory for the anonymous-id store. Defaults to the OS app-data dir; injectable for tests. */
  dataDir?: string;
  /** Environment (injectable for tests). */
  env?: NodeJS.ProcessEnv;
  /** Logger used for the one-time first-run notice. */
  log: (message: string) => void;
  /** Anonymous payload fields (everything except anonymousId, which is resolved internally). */
  payload: Omit<ServeStartedPayload, 'anonymousId'>;
}

/**
 * Fire-and-forget anonymous telemetry for `owox serve`. Never throws and never blocks startup.
 * Silent when opted out (OWOX_TELEMETRY_DISABLED / DO_NOT_TRACK / CI) or when no PostHog key is set.
 */
export function trackServeStarted(options: TrackServeStartedOptions): void {
  try {
    const env = options.env ?? process.env;
    if (!isTelemetryEnabled(env)) return;

    const config = resolvePostHogConfig(env);
    if (!config.apiKey) return;

    const { anonymousId, isFirstRun } = getOrCreateAnonymousId(options.dataDir);
    if (!anonymousId) return;

    if (isFirstRun) {
      options.log(
        `OWOX collects anonymous usage telemetry (no personal data). ` +
          `Disable it with OWOX_TELEMETRY_DISABLED=1. Learn more: ${DOCS_URL}`
      );
    }

    const bus = new EventBus([new PostHogTransport(config)]);
    bus.produceEventSafely(new ServeStartedEvent({ anonymousId, ...options.payload }));
  } catch {
    // Telemetry must never break the CLI.
  }
}
