import { BaseEvent } from './base-event.js';

/**
 * Marker base class for anonymous product-telemetry events.
 *
 * Only subclasses of TelemetryEvent are accepted by PostHogTransport. This is a
 * defense-in-depth boundary: PII-bearing domain events (which extend BaseEvent directly)
 * can never be sent to PostHog, even if the transport is wired into a shared bus.
 *
 * Subclasses MUST expose `name` via a getter (not an instance field): BaseEvent's
 * constructor freezes the instance, so a field initializer would fail.
 */
export abstract class TelemetryEvent<
  TPayload extends object = Record<string, unknown>,
> extends BaseEvent<TPayload> {}

/** Type guard: true only for TelemetryEvent instances. */
export function isTelemetryEvent(event: unknown): event is TelemetryEvent {
  return event instanceof TelemetryEvent;
}
