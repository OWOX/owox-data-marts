import { Module, InjectionToken } from '@nestjs/common';
import {
  createProducer,
  createEventBusFromEnv,
  type OwoxProducer,
  type EventBusExtras,
} from '@owox/internal-helpers';

/**
 * Injection token for the OWOX Integrations Producer.
 * Use this token to inject the producer into your services/controllers.
 */
export const OWOX_PRODUCER: InjectionToken = Symbol('OWOX_PRODUCER');

/**
 * Optional bus extras (transports/offloader) contributed by ONE feature module (e.g. ee/mcp).
 * Single-owner: the injected offloader serves the whole producer, so at most one provider may bind
 * this token — a second @Global provider would silently shadow the first.
 */
export const BUS_EXTRAS: InjectionToken = Symbol('BUS_EXTRAS');

/**
 * ProducerModule provides an injectable OWOX Integrations Producer instance.
 *
 * Usage:
 * - Import ProducerModule into your NestJS module
 * - Inject using `@Inject(OWOX_PRODUCER) producer: OwoxProducer`
 */
@Module({
  providers: [
    {
      provide: OWOX_PRODUCER,
      useFactory: (extras?: EventBusExtras): OwoxProducer =>
        createProducer(createEventBusFromEnv(process.env, extras ?? {})),
      inject: [{ token: BUS_EXTRAS, optional: true }],
    },
  ],
  exports: [OWOX_PRODUCER],
})
export class ProducerModule {}
