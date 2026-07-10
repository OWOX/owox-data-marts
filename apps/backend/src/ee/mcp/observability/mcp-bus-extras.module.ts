import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { BUS_EXTRAS } from '../../../common/producer/producer.module';
import { buildMcpBusExtras, type McpBusExtras } from './mcp-bus-wiring';

/** @Global so ProducerModule (common) can inject BUS_EXTRAS without importing ee. */
@Global()
@Module({
  providers: [{ provide: BUS_EXTRAS, useFactory: () => buildMcpBusExtras() }],
  exports: [BUS_EXTRAS],
})
export class McpBusExtrasModule implements OnApplicationShutdown {
  // Inject the very instance provided under BUS_EXTRAS so shutdown drains that build's own hooks.
  constructor(@Inject(BUS_EXTRAS) private readonly extras: McpBusExtras) {}

  async onApplicationShutdown(): Promise<void> {
    await this.extras.shutdown();
  }
}
