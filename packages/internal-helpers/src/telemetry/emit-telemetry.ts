import { EventBus } from '../integrations/event-bus/event-bus.js';
import { resolvePostHogConfig } from '../integrations/event-bus/posthog-config.js';
import type { TelemetryEvent } from '../integrations/event-bus/telemetry-event.js';
import { PostHogTransport } from '../integrations/event-bus/transports/posthog-transport.js';
import { getOrCreateAnonymousId } from './anonymous-id.js';
import { isTelemetryEnabled } from './is-telemetry-enabled.js';

export interface EmitTelemetryOptions {
  /** Build the telemetry event from the resolved anonymous id. */
  buildEvent: (anonymousId: string) => TelemetryEvent<object>;
  /** Directory for the anonymous-id store; defaults to OS app-data dir. Injectable for tests. */
  dataDir?: string;
  /** Environment; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Optional one-time first-run notice text. */
  firstRunNotice?: string;
  /** Logger for the first-run notice. */
  log?: (message: string) => void;
}

/**
 * Anonymous, opt-out, fire-and-forget telemetry. Never throws and never blocks.
 * Silent when opted out (OWOX_TELEMETRY_DISABLED / DO_NOT_TRACK / CI) or no PostHog key is set.
 */
export function emitTelemetry(options: EmitTelemetryOptions): void {
  try {
    const env = options.env ?? process.env;
    if (!isTelemetryEnabled(env)) return;

    const config = resolvePostHogConfig(env);
    if (!config.apiKey) return;

    const { anonymousId, isFirstRun } = getOrCreateAnonymousId(options.dataDir);
    if (!anonymousId) return;

    if (isFirstRun && options.firstRunNotice && options.log) {
      options.log(options.firstRunNotice);
    }

    const bus = new EventBus([new PostHogTransport(config)]);
    bus.produceEventSafely(options.buildEvent(anonymousId));
  } catch {
    // Telemetry must never break the CLI.
  }
}
