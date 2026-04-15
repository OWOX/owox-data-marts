import { Global, Module } from '@nestjs/common';
import { ProducerModule } from '../producer/producer.module';
import { OwoxEventDispatcher } from './owox-event-dispatcher';

/**
 * Global module exposing {@link OwoxEventDispatcher}. Marked `@Global()` so any
 * feature module can inject the dispatcher without re-importing.
 */
@Global()
@Module({
  imports: [ProducerModule],
  providers: [OwoxEventDispatcher],
  exports: [OwoxEventDispatcher],
})
export class OwoxEventDispatcherModule {}
