import { Module, InjectionToken } from '@nestjs/common';
import { createProducer, type OwoxProducer } from '@owox/internal-helpers';

/**
 * Injection token for the OWOX Integrations Producer.
 * Use this token to inject the producer into your services/controllers.
 */
export const OWOX_PRODUCER: InjectionToken = Symbol('OWOX_PRODUCER');

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
      useFactory: (): OwoxProducer => createProducer(),
    },
  ],
  exports: [OWOX_PRODUCER],
})
export class ProducerModule {}
