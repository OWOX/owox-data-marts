import { Column } from 'typeorm';
import { Trigger } from './trigger.entity';

/**
 * Abstract base class for time-based triggers.
 * Extends Trigger to add time-based scheduling capabilities.
 *
 * This class defines the common properties and behaviors for all time-based triggers.
 * Concrete trigger implementations should extend this class and add any additional
 * properties specific to their use case.
 */
export abstract class TimeBasedTrigger extends Trigger {
  /**
   * The timestamp when this trigger should next be executed.
   * If null, the trigger is not scheduled for execution.
   */
  @Column({ type: 'datetime', nullable: true })
  nextRunTimestamp: Date | null;

  /**
   * The timestamp when this trigger was last executed.
   * If null, the trigger has never been executed.
   */
  @Column({ type: 'datetime', nullable: true })
  lastRunTimestamp: Date | null;

  /**
   * Updates the trigger state after successful processing.
   *
   * @param lastRunTimestamp The timestamp when the trigger was processed
   */
  onSuccess(lastRunTimestamp: Date) {
    this.lastRunTimestamp = lastRunTimestamp;
    super.onSuccess();
    this.discardNextRun();
  }

  /**
   * Updates the trigger state after a processing error.
   *
   * @param lastRunTimestamp The timestamp when the trigger processing was attempted
   */
  onError(lastRunTimestamp: Date) {
    this.lastRunTimestamp = lastRunTimestamp;
    super.onError();
  }

  /**
   * Disables the trigger by clearing the next run timestamp and setting it as inactive.
   */
  discardNextRun() {
    this.nextRunTimestamp = null;
    this.isActive = false;
  }
}
