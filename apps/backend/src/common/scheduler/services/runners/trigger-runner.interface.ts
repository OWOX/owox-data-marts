import { TimeBasedTrigger } from '../../shared/entities/time-based-trigger.entity';

/**
 * Interface for services that run time-based triggers.
 *
 * This interface defines the contract for services that process time-based triggers.
 * Implementations can use different strategies for running triggers, such as direct execution
 * or asynchronous processing through message queues.
 *
 * @typeParam T - The type of trigger this service processes, must extend TimeBasedTrigger
 */
export interface TriggerRunnerService<T extends TimeBasedTrigger> {
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
}
