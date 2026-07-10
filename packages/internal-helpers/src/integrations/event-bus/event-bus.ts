import type { EventTransport } from './types.js';
import type { BaseEvent } from './base-event.js';
import { LoggerFactory } from '../../logging/logger-factory.js';
import { LoggerTransport } from './transports/logger-transport.js';
import { PostHogTransport } from './transports/posthog-transport.js';
import { resolvePostHogConfig } from './posthog-config.js';
import { resolveEventBusConfig } from './config.js';
import { castError } from '../../utils/castError.js';
import type { PayloadOffloader } from '../blob-store/payload-offloader.js';

/**
 * Non-transactional fan-out event bus
 */
export class EventBus {
  private readonly transports: readonly EventTransport[];
  private readonly logger = LoggerFactory.createNamedLogger('EventBusTransport');

  constructor(
    transports: readonly EventTransport[],
    private readonly offloader?: PayloadOffloader
  ) {
    this.transports = transports;
  }

  /**
   * Fan-out an event to all configured transports. Each transport is isolated:
   * one failure is logged and won't break the others.
   */
  async produceEvent<TPayload extends object>(event: BaseEvent<TPayload>): Promise<void> {
    if (this.offloader) {
      try {
        await this.offloader.apply(event.payload as Record<string, unknown>);
      } catch (error) {
        this.logger.warn(`Payload offload failed for ${event.name}`, { error: castError(error) });
      }
    }

    const results = await Promise.allSettled(this.transports.map(t => t.send(event)));

    const isRejected = <T>(r: PromiseSettledResult<T>): r is PromiseRejectedResult =>
      r.status === 'rejected';

    const errors = results
      .map((r, i) => ({ r, t: this.transports[i] }))
      .filter(({ r }) => isRejected(r)) as { r: PromiseRejectedResult; t: EventTransport }[];

    if (errors.length > 0) {
      const details = errors
        .map(({ r, t }) => `${t.name ?? t.constructor.name}: ${String(r.reason)}`)
        .join('; ');

      throw new AggregateError(
        errors.map(e => e.r.reason),
        `Failed to send via ${errors.length} transports — ${details}`
      );
    }
  }

  produceEventSafely<TPayload extends object>(event: BaseEvent<TPayload>): void {
    void this.produceEvent(event).catch(error => {
      this.logger.error(`Failed to produce ${event.name}`, {}, castError(error));
    });
  }

  getEnabledTransportNames(): readonly string[] {
    return this.transports.map(t => t.name);
  }
}

/**
 * Extra wiring injected by the composition root on top of the env-driven transports
 * (e.g. logger/posthog). Lets a Layer A caller (e.g. the backend's MCP wiring) add
 * domain-specific transports and an offloader without this package knowing about them.
 */
export interface EventBusExtras {
  extraTransports?: EventTransport[];
  offloader?: PayloadOffloader;
}

/**
 * Create EventBus instance using env configuration.
 */
export function createEventBusFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  extras: EventBusExtras = {}
): EventBus {
  const config = resolveEventBusConfig(env);

  const transports: EventTransport[] = [];
  for (const name of config.enabledTransports) {
    switch (name) {
      case 'logger':
        transports.push(new LoggerTransport(LoggerFactory.createNamedLogger('EventBus')));
        break;
      case 'posthog':
        transports.push(new PostHogTransport(resolvePostHogConfig(env)));
        break;
      default:
        throw new Error(`Unknown event transport: ${name}`);
    }
  }

  if (extras.extraTransports) transports.push(...extras.extraTransports);

  return new EventBus(transports, extras.offloader);
}
