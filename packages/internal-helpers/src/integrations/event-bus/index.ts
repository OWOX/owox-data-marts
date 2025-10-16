export type { EventTransport, EventBusConfig } from './types.js';
export { INTEGRATIONS_TRANSPORTS_ENV, resolveEventBusConfig } from './config.js';
export { EventBus, createEventBusFromEnv } from './event-bus.js';
export { BaseEvent } from './base-event.js';
export { type OwoxMessage, buildOwoxMessage } from './message-format.js';

import type { BaseEvent } from './base-event.js';
import { createEventBusFromEnv, EventBus } from './event-bus.js';

// Factory-based producer
export type OwoxProducer = {
  readonly transports: readonly string[];
  produceEvent<TPayload extends object>(event: BaseEvent<TPayload>): Promise<void>;
};

export function createProducer(bus: EventBus = createEventBusFromEnv()): OwoxProducer {
  return {
    get transports() {
      return bus.getEnabledTransportNames();
    },
    produceEvent(event) {
      return bus.produceEvent(event);
    },
  } as const;
}
