import { Trigger } from '../../shared/entities/trigger.entity';

/**
 * Interface for services that run time-based triggers.
 *
 * This interface defines the contract for services that process time-based triggers.
 * Implementations can use different strategies for running triggers, such as direct execution
 * or asynchronous processing through message queues.
 *
 * @typeParam T - The type of trigger this service processes, must extend TimeBasedTrigger
 */
export interface TriggerRunnerService<T extends Trigger> {
  /**
   * Processes a batch of triggers.
   *
   * This method is responsible for executing the business logic associated with each trigger.
   * Implementations should handle errors appropriately and ensure that triggers are properly
   * marked as processed or failed.
   *
   * @param triggers An array of triggers to process
   * @returns A promise that resolves when all triggers have been processed or scheduled for processing
   */
  runTriggers(triggers: T[]): Promise<void>;

  /**
   * Aborts the execution of specified trigger runs.
   *
   * @param {T[]} triggers - An array of trigger objects to be aborted.
   * @return {Promise<void>} A promise that resolves when the trigger runs have been successfully aborted.
   */
  abortTriggerRuns(triggers: T[]): Promise<void>;
}
