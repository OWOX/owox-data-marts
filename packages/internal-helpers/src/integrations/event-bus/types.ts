import type { BaseEvent } from './base-event.js';

export interface EventTransport {
  /** Unique transport name identifier, e.g., "logger" */
  readonly name: string;
  /**
   * Sends the event to the underlying system. Must not throw fatally.
   * Implementation can throw, but EventBus will isolate and log per-transport failures.
   */
  send(event: BaseEvent<object>): Promise<void>;
}

export interface EventBusConfig {
  /** Enabled transport names as resolved from environment */
  enabledTransports: readonly string[];
}
