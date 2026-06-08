import type { EventTransport } from '../types.js';
import type { BaseEvent } from '../base-event.js';
import type { PostHogConfig } from '../posthog-config.js';
import { isTelemetryEvent } from '../telemetry-event.js';

/**
 * Sends anonymous telemetry events to the PostHog capture API.
 *
 * - No-op for any event that is not a TelemetryEvent (PII protection).
 * - `distinct_id` is taken from the event payload's `anonymousId`; the rest of the payload
 *   becomes PostHog `properties`.
 * - Fire-and-forget: all network/timeout errors are swallowed; never throws fatally.
 */
export class PostHogTransport implements EventTransport {
  public readonly name = 'posthog' as const;
  private readonly config: PostHogConfig;

  constructor(config: PostHogConfig) {
    this.config = config;
  }

  async send(event: BaseEvent<Record<string, unknown>>): Promise<void> {
    if (!isTelemetryEvent(event)) return;
    if (!this.config.apiKey) return;

    const payload = { ...(event.payload as Record<string, unknown>) };
    const anonymousId = payload.anonymousId;
    if (typeof anonymousId !== 'string' || anonymousId.length === 0) return;
    delete payload.anonymousId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const body = JSON.stringify({
        api_key: this.config.apiKey,
        event: event.name,
        distinct_id: anonymousId,
        properties: payload,
        timestamp: event.occurredAt ?? new Date().toISOString(),
      });
      await fetch(`${this.config.host}/i/v0/e/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      });
    } catch {
      // Telemetry must never break or slow the CLI; swallow all errors.
    } finally {
      clearTimeout(timer);
    }
  }
}
