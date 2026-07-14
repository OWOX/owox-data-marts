import { EventBus } from './event-bus.js';
import { BaseEvent } from './base-event.js';
import { OFFLOAD_KEY, PayloadOffloader } from '../blob-store/payload-offloader.js';
import type { EventTransport } from './types.js';

class TestEvent extends BaseEvent<Record<string, unknown>> {
  get name() {
    return 'test.event';
  }
  constructor(payload: Record<string, unknown>) {
    super(payload);
  }
}

describe('EventBus offload', () => {
  it('застосовує offloader до fan-out — транспорт бачить підмінений payload', async () => {
    const seen: Record<string, unknown>[] = [];
    const spy: EventTransport = {
      name: 'spy',
      send: async e => {
        seen.push({ ...e.payload });
      },
    };
    const offloader = new PayloadOffloader({ sink: 'inline', inlineMaxBytes: 4096 });
    const bus = new EventBus([spy], offloader);

    await bus.produceEvent(new TestEvent({ top: 1, [OFFLOAD_KEY]: { inner: 2 } }));

    expect(seen[0][OFFLOAD_KEY]).toBeUndefined();
    expect(seen[0]['inner']).toBe(2);
    expect(seen[0]['top']).toBe(1);
  });

  it('offloader failure never blocks fan-out — transports still receive the event', async () => {
    const seen: Record<string, unknown>[] = [];
    const spy: EventTransport = {
      name: 'spy',
      send: async e => {
        seen.push({ ...e.payload });
      },
    };
    const throwingOffloader = {
      apply: async () => {
        throw new Error('offload boom');
      },
    } as unknown as PayloadOffloader;
    const bus = new EventBus([spy], throwingOffloader);

    await expect(
      bus.produceEvent(new TestEvent({ top: 1, [OFFLOAD_KEY]: { inner: 2 } }))
    ).resolves.toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0]['top']).toBe(1);
  });
});
