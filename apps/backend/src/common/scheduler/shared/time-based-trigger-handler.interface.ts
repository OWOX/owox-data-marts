import { TimeBasedTrigger } from './entities/time-based-trigger.entity';
import { Repository } from 'typeorm';

/**
 * Interface for handling time-based triggers.
 *
 * Implementations of this interface define how triggers are processed and when they should run.
 * Each handler is responsible for a specific type of trigger and provides the repository,
 * processing logic, and scheduling information for that trigger type.
 *
 * @typeParam T - The type of trigger this handler processes, must extend TimeBasedTrigger
 */
export interface TimeBasedTriggerHandler<T extends TimeBasedTrigger> {
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
   * @returns A promise that resolves when the trigger has been processed
   */
  handleTrigger(trigger: T): Promise<void>;

  /**
   * Returns the cron expression that defines when triggers should be checked for processing.
   *
   * This cron expression determines how frequently the system checks for triggers
   * that are ready to be processed.
   *
   * @returns A cron expression string (e.g., "0 * * * *" for every hour)
   */
  processingCronExpression(): string;
}
