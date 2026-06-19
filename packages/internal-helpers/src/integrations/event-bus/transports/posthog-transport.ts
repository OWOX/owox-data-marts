import type { EventTransport } from '../types.js';
import type { BaseEvent } from '../base-event.js';
import type { PostHogConfig } from '../posthog-config.js';
import { isTelemetryEvent } from '../telemetry-event.js';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Sends anonymous telemetry events to the PostHog capture API.
 *
 * - No-op for any event that is not a TelemetryEvent (PII protection).
 * - `distinct_id` is taken from the event payload's `anonymousId`; the rest of the payload
 *   becomes PostHog `properties`.
 * - Fire-and-forget: all network/timeout errors are swallowed; never throws fatally.
 * - Uses node:http/https with socket.unref() so the CLI process is never held alive by
 *   pending telemetry I/O.
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

    const body = JSON.stringify({
      api_key: this.config.apiKey,
      event: event.name,
      distinct_id: anonymousId,
      properties: payload,
      timestamp: event.occurredAt ?? new Date().toISOString(),
    });

    await new Promise<void>(resolve => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      try {
        const url = new URL(`${this.config.host}/i/v0/e/`);
        const requestFn = url.protocol === 'http:' ? httpRequest : httpsRequest;
        const req = requestFn(
          url,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(body),
            },
          },
          res => {
            // Drain and discard the response; we don't need the body.
            res.resume();
            res.on('end', finish);
            res.on('error', finish);
          }
        );
        // Do NOT keep the CLI process alive for fire-and-forget telemetry.
        req.on('socket', socket => socket.unref());
        req.on('error', finish);
        const timer = setTimeout(() => {
          req.destroy();
          finish();
        }, this.config.timeoutMs);
        timer.unref();
        req.end(body);
      } catch {
        finish();
      }
    });
  }
}
