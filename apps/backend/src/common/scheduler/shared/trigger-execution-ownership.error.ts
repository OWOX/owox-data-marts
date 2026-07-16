import type { EntityManager } from 'typeorm';

export interface TriggerExecutionOwnership {
  assertOwned(manager?: EntityManager): Promise<void>;
}

/**
 * Signals that another scheduler epoch owns the persisted trigger execution.
 * Runners treat this as a transient concurrency outcome and must not save stale state.
 */
export class TriggerExecutionOwnershipError extends Error {
  constructor(
    readonly triggerId: string,
    readonly expectedVersion: number,
    readonly cause?: unknown
  ) {
    super(`Trigger ${triggerId} no longer owns execution epoch ${expectedVersion}`);
    this.name = 'TriggerExecutionOwnershipError';
  }
}
