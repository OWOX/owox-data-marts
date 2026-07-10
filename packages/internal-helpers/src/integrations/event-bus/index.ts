export type { EventTransport, EventBusConfig } from './types.js';
export { PostHogTransport } from './transports/posthog-transport.js';
export {
  OtlpTransport,
  type OtlpSpanEmitter,
  type OtlpSpanInfo,
  type OtlpSpanMapper,
  type OtlpTransportOptions,
} from './transports/otlp-transport.js';
export { deriveTraceId, createOtlpEmitter } from './transports/otlp-emitter.js';
export { type PostHogConfig, resolvePostHogConfig } from './posthog-config.js';
export { INTEGRATIONS_TRANSPORTS_ENV, resolveEventBusConfig } from './config.js';
export { EventBus, createEventBusFromEnv, type EventBusExtras } from './event-bus.js';
export { BaseEvent } from './base-event.js';
export { TelemetryEvent, isTelemetryEvent } from './telemetry-event.js';
export { type OwoxMessage, buildOwoxMessage } from './message-format.js';
export { OFFLOAD_KEY, PayloadOffloader } from '../blob-store/index.js';

import type { BaseEvent } from './base-event.js';
import { createEventBusFromEnv, EventBus } from './event-bus.js';

// Factory-based producer
export type OwoxProducer = {
  readonly transports: readonly string[];
  produceEvent<TPayload extends object>(event: BaseEvent<TPayload>): Promise<void>;
  produceEventSafely<TPayload extends object>(event: BaseEvent<TPayload>): void;
};

export function createProducer(bus: EventBus = createEventBusFromEnv()): OwoxProducer {
  return {
    get transports() {
      return bus.getEnabledTransportNames();
    },
    produceEvent(event) {
      return bus.produceEvent(event);
    },
    produceEventSafely(event) {
      bus.produceEventSafely(event);
    },
  } as const;
}
