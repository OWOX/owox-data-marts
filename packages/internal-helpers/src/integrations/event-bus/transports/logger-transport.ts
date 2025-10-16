import type { EventTransport } from '../types.js';
import type { BaseEvent } from '../base-event.js';
import type { Logger } from '../../../logging/types.js';
import { buildOwoxMessage } from '../message-format.js';

/**
 * Simple transport that writes events to the application logger.
 */
export class LoggerTransport implements EventTransport {
  public readonly name = 'logger' as const;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async send(event: BaseEvent<Record<string, unknown>>): Promise<void> {
    // Build OWOX envelope with the event details as body
    const body = {
      event: {
        name: event.name,
        occurredAt: event.occurredAt ?? new Date().toISOString(),
      },
      payload: event.payload,
    } satisfies Record<string, unknown>;

    const message = buildOwoxMessage(body);

    // Emit structured message in logs
    this.logger.info('Event', message as unknown as Record<string, unknown>);
  }
}
