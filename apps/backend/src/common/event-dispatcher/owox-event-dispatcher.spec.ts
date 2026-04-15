jest.mock('typeorm-transactional', () => ({
  runOnTransactionCommit: jest.fn((fn: () => void) => fn()),
}));

import { runOnTransactionCommit } from 'typeorm-transactional';
import { BaseEvent } from '@owox/internal-helpers';
import { OwoxEventDispatcher } from './owox-event-dispatcher';

class TestEvent extends BaseEvent<{ value: string }> {
  get name() {
    return 'test.event' as const;
  }
  constructor(value: string) {
    super({ value });
  }
}

describe('OwoxEventDispatcher', () => {
  const createDispatcher = () => {
    const producer = {
      produceEvent: jest.fn().mockResolvedValue(undefined),
      produceEventSafely: jest.fn(),
      transports: [],
    };
    const eventEmitter = {
      emit: jest.fn(),
    };
    const dispatcher = new OwoxEventDispatcher(producer as never, eventEmitter as never);
    return { dispatcher, producer, eventEmitter };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('publishExternal', () => {
    it('forwards to OwoxProducer.produceEvent', async () => {
      const { dispatcher, producer } = createDispatcher();
      const event = new TestEvent('a');

      await dispatcher.publishExternal(event);

      expect(producer.produceEvent).toHaveBeenCalledWith(event);
    });
  });

  describe('publishExternalSafely', () => {
    it('forwards to OwoxProducer.produceEventSafely', () => {
      const { dispatcher, producer } = createDispatcher();
      const event = new TestEvent('safely');

      dispatcher.publishExternalSafely(event);

      expect(producer.produceEventSafely).toHaveBeenCalledWith(event);
    });
  });

  describe('publishLocal', () => {
    it('emits on EventEmitter2 immediately using event.name', () => {
      const { dispatcher, eventEmitter } = createDispatcher();
      const event = new TestEvent('b');

      dispatcher.publishLocal(event);

      expect(eventEmitter.emit).toHaveBeenCalledWith('test.event', event);
    });
  });

  describe('publishLocalOnCommit', () => {
    it('registers a callback via runOnTransactionCommit and emits when it fires', () => {
      const { dispatcher, eventEmitter } = createDispatcher();
      const event = new TestEvent('c');

      dispatcher.publishLocalOnCommit(event);

      expect(runOnTransactionCommit).toHaveBeenCalledWith(expect.any(Function));
      expect(eventEmitter.emit).toHaveBeenCalledWith('test.event', event);
    });
  });

  describe('publish', () => {
    it('emits external and local immediately', async () => {
      const { dispatcher, producer, eventEmitter } = createDispatcher();
      const event = new TestEvent('d');

      await dispatcher.publish(event);

      expect(producer.produceEvent).toHaveBeenCalledWith(event);
      expect(eventEmitter.emit).toHaveBeenCalledWith('test.event', event);
    });
  });

  describe('publishOnCommit', () => {
    it('emits external immediately and registers local on commit', async () => {
      const { dispatcher, producer, eventEmitter } = createDispatcher();
      const event = new TestEvent('e');

      await dispatcher.publishOnCommit(event);

      expect(producer.produceEvent).toHaveBeenCalledWith(event);
      expect(runOnTransactionCommit).toHaveBeenCalledWith(expect.any(Function));
      expect(eventEmitter.emit).toHaveBeenCalledWith('test.event', event);
    });
  });
});
