import type { EventTransport } from '../types.js';
import type { BaseEvent } from '../base-event.js';
import type { Logger } from '../../../logging/types.js';
import { buildOwoxMessage } from '../message-format.js';

export interface LoggerTransportOptions {
  /** Resolve the logger name per event (→ `jsonPayload.name`); undefined ⇒ the default name. */
  resolveLoggerName?: (event: BaseEvent<Record<string, unknown>>) => string | undefined;
}

export class LoggerTransport implements EventTransport {
  public readonly name = 'logger' as const;
  private readonly cache = new Map<string, Logger>();

  constructor(
    private readonly createLogger: (name: string) => Logger,
    private readonly defaultName: string,
    private readonly options: LoggerTransportOptions = {}
  ) {}

  private loggerFor(event: BaseEvent<Record<string, unknown>>): Logger {
    const name = this.options.resolveLoggerName?.(event) ?? this.defaultName;
    let logger = this.cache.get(name);
    if (!logger) {
      logger = this.createLogger(name);
      this.cache.set(name, logger);
    }
    return logger;
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

    const message = {
      event: buildOwoxMessage(body),
    };

    this.loggerFor(event).info('Event', message as unknown as Record<string, unknown>);
  }
}
