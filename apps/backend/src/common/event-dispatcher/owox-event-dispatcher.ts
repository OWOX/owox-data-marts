import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { runOnTransactionCommit } from 'typeorm-transactional';
import type { BaseEvent, OwoxProducer } from '@owox/internal-helpers';
import { OWOX_PRODUCER } from '../producer/producer.module';

/**
 * Single entry point for emitting domain events. Wraps the external
 * {@link OwoxProducer} bus and the in-process {@link EventEmitter2} bus so
 * call sites stop juggling them.
 *
 * | Method                  | External | Local | On commit |
 * |-------------------------|----------|-------|-----------|
 * | `publishExternal`       | yes      | no    | no        |
 * | `publishExternalSafely` | yes      | no    | no        |
 * | `publishLocal`          | no       | yes   | no        |
 * | `publishLocalOnCommit`  | no       | yes   | yes       |
 * | `publish`               | yes      | yes   | no        |
 * | `publishOnCommit`       | yes      | yes   | yes (local) |
 */
@Injectable()
export class OwoxEventDispatcher {
  constructor(
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly eventEmitter: EventEmitter2
  ) {}

  /** Send to the external bus. Awaited; throws on transport failure. */
  async publishExternal<TPayload extends object>(event: BaseEvent<TPayload>): Promise<void> {
    await this.producer.produceEvent(event);
  }

  /** Send to the external bus without awaiting. Errors are swallowed by the producer. */
  publishExternalSafely<TPayload extends object>(event: BaseEvent<TPayload>): void {
    this.producer.produceEventSafely(event);
  }

  /** Emit on the in-process bus immediately. */
  publishLocal<TPayload extends object>(event: BaseEvent<TPayload>): void {
    this.eventEmitter.emit(event.name, event);
  }

  /**
   * Defer the in-process emit until the surrounding transaction commits.
   * If the transaction rolls back, the callback is discarded.
   */
  publishLocalOnCommit<TPayload extends object>(event: BaseEvent<TPayload>): void {
    runOnTransactionCommit(() => {
      this.eventEmitter.emit(event.name, event);
    });
  }

  /** External + local, both immediate. */
  async publish<TPayload extends object>(event: BaseEvent<TPayload>): Promise<void> {
    await this.publishExternal(event);
    this.publishLocal(event);
  }

  /** External immediate + local on commit. Standard choice for `@Transactional()` use-cases. */
  async publishOnCommit<TPayload extends object>(event: BaseEvent<TPayload>): Promise<void> {
    await this.publishExternal(event);
    this.publishLocalOnCommit(event);
  }
}
