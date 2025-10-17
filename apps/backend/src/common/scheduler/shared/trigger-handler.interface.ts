import { Repository } from 'typeorm';
import { Trigger } from './entities/trigger.entity';

/**
 * Interface for handling triggers.
 *
 * Implementations of this interface define how triggers are processed and when they should run.
 * Each handler is responsible for a specific type of trigger and provides the repository,
 * processing logic, and scheduling information for that trigger type.
 *
 * @typeParam T - The type of trigger this handler processes, must extend Trigger
 */
export interface TriggerHandler<T extends Trigger> {
  /**
   * Returns the repository for the trigger type handled by this handler.
   *
   * @returns The TypeORM repository for the trigger entity
   */
  getTriggerRepository(): Repository<T>;

  /**
   * Handles the processing of a single trigger.
   *
   * This method contains the business logic for processing the trigger.
   * It is called when a trigger is ready to be processed.
   *
   * @param trigger The trigger to process
   * @param options Optional parameters for handling the trigger (e.g., signal)
   * @returns A promise that resolves when the trigger has been processed
   */
  handleTrigger(trigger: T, options?: { signal?: AbortSignal }): Promise<void>;

  /**
   * Returns the cron expression that defines when triggers should be checked for processing.
   *
   * This cron expression determines how frequently the system checks for triggers
   * that are ready to be processed.
   *
   * @returns A cron expression string (e.g., "0 * * * *" for every hour)
   */
  processingCronExpression(): string;

  /**
   * Returns the timeout duration in seconds for a stuck trigger condition.
   * This timeout defines the maximum amount of time the system should wait
   * before considering a trigger as stuck and taking action accordingly.
   *
   * @return {number} The number of seconds configured for the stuck trigger timeout.
   */
  stuckTriggerTimeoutSeconds?(): number;

  /**
   * Returns the TTL (time-to-live) duration in seconds for triggers.
   * This TTL defines the maximum amount of time a trigger can remain in the system
   * before being automatically deleted.
   *
   * @return {number} The number of seconds configured for the trigger TTL.
   */
  triggerTtlSeconds?(): number;
}
