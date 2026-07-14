import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProducerModule, OWOX_PRODUCER, BUS_EXTRAS } from './producer.module';

// Mirrors how a real feature (e.g. ee/mcp's McpBusExtrasModule) contributes BUS_EXTRAS:
// a @Global module providing the token so ProducerModule can inject it without importing
// the feature. A plain root-level provider wouldn't cross ProducerModule's module boundary.
@Global()
@Module({
  providers: [
    {
      provide: BUS_EXTRAS,
      useValue: { extraTransports: [{ name: 'fake', send: async () => {} }] },
    },
  ],
  exports: [BUS_EXTRAS],
})
class FakeBusExtrasModule {}

describe('ProducerModule BUS_EXTRAS injection', () => {
  it('builds a producer without BUS_EXTRAS (community-safe)', async () => {
    const mod = await Test.createTestingModule({ imports: [ProducerModule] }).compile();
    expect(mod.get(OWOX_PRODUCER)).toBeDefined(); // no throw = optional inject resolved to undefined
  });

  it('applies extra transports contributed via BUS_EXTRAS', async () => {
    const mod = await Test.createTestingModule({
      imports: [FakeBusExtrasModule, ProducerModule],
    }).compile();
    const producer = mod.get(OWOX_PRODUCER) as { transports: readonly string[] };
    expect(producer.transports).toContain('fake');
  });
});
