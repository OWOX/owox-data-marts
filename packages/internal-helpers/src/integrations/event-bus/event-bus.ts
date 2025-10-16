import type { EventTransport } from './types.js';
import type { BaseEvent } from './base-event.js';
import { LoggerFactory } from '../../logging/logger-factory.js';
import { LoggerTransport } from './transports/logger-transport.js';
import { resolveEventBusConfig } from './config.js';

/**
 * Non-transactional fan-out event bus
 */
export class EventBus {
  private readonly transports: readonly EventTransport[];

  constructor(transports: readonly EventTransport[]) {
    this.transports = transports;
  }

  /**
   * Fan-out an event to all configured transports. Each transport is isolated:
   * one failure is logged and won't break the others.
   */
  async produceEvent<TPayload extends object>(event: BaseEvent<TPayload>): Promise<void> {
    await Promise.all(
      this.transports.map(async t => {
        await t.send(event);
      })
    );
  }

  getEnabledTransportNames(): readonly string[] {
    return this.transports.map(t => t.name);
  }
}

/**
 * Create EventBus instance using env configuration.
 */
export function createEventBusFromEnv(env: NodeJS.ProcessEnv = process.env): EventBus {
  const config = resolveEventBusConfig(env);

  const transports: EventTransport[] = [];
  for (const name of config.enabledTransports) {
    switch (name) {
      case 'logger':
        transports.push(new LoggerTransport(LoggerFactory.createNamedLogger('EventBus')));
        break;
      default:
        throw new Error(`Unknown event transport: ${name}`);
    }
  }

  return new EventBus(transports);
}
