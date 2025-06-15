import { TimeBasedTrigger, TriggerStatus } from './time-based-trigger.entity';
import { Column } from 'typeorm';
import { CronTime } from 'cron';

/**
 * Abstract class for triggers that run on a schedule defined by a cron expression.
 *
 * This class extends TimeBasedTrigger to provide functionality for scheduling
 * recurring tasks based on cron expressions. It automatically calculates the next
 * run time after each execution (successful or failed) using the provided cron
 * expression and timezone.
 */
export abstract class ScheduledTrigger extends TimeBasedTrigger {
  /**
   * The cron expression that defines when this trigger should run.
   *
   * Uses standard cron format (e.g., '0 0 0 * * *' for daily at midnight).
   */
  @Column()
  cronExpression: string;

  /**
   * The timezone to use when interpreting the cron expression.
   *
   * Should be a valid IANA timezone identifier (e.g., 'UTC', 'America/New_York').
   */
  @Column()
  timeZone: string;

  /**
   * Updates the trigger state after successful processing and schedules the next run.
   *
   * Overrides the parent class implementation to automatically schedule the next run
   * based on the cron expression.
   *
   * @param lastRunTimestamp The timestamp when the trigger was processed
   */
  onSuccess(lastRunTimestamp: Date) {
    this.lastRunTimestamp = lastRunTimestamp;
    this.scheduleNextRun(lastRunTimestamp);
  }

  /**
   * Updates the trigger state after a processing error and schedules the next run.
   *
   * Overrides the parent class implementation to automatically schedule the next run
   * based on the cron expression, even after an error.
   *
   * @param lastRunTimestamp The timestamp when the trigger processing was attempted
   */
  onError(lastRunTimestamp: Date) {
    this.lastRunTimestamp = lastRunTimestamp;
    this.scheduleNextRun(lastRunTimestamp);
  }

  /**
   * Calculates and sets the next run time based on the cron expression and timezone.
   *
   * This method uses the CronTime utility to determine when the trigger should next run,
   * starting from the provided date. It also updates the trigger status to IDLE and
   * activates the trigger.
   *
   * @param startFrom The date to start calculating the next run from
   * @throws Error if the calculated next run time is not in the future
   */
  scheduleNextRun(startFrom: Date) {
    // Create a CronTime instance with the cron expression and timezone
    const cronTime = new CronTime(this.cronExpression, this.timeZone);

    // Calculate the next run time based on the startFrom parameter
    const nextRunTimestamp = cronTime.getNextDateFrom(startFrom).toJSDate();

    if (nextRunTimestamp <= startFrom) {
      throw new Error('Next run timestamp is in the past');
    }

    this.nextRunTimestamp = nextRunTimestamp;
    this.isActive = true;
    this.status = TriggerStatus.IDLE;
  }
}
