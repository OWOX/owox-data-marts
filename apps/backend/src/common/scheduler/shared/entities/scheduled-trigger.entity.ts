import { TimeBasedTrigger, TriggerStatus } from './time-based-trigger.entity';
import { Column } from 'typeorm';
import { CronTime } from 'cron';

export abstract class ScheduledTrigger extends TimeBasedTrigger {
  @Column()
  cronExpression: string;

  @Column()
  timeZone: string;

  onSuccess(lastRunTimestamp: Date) {
    this.lastRunTimestamp = lastRunTimestamp;
    this.scheduleNextRun(lastRunTimestamp);
  }

  onError(lastRunTimestamp: Date) {
    this.lastRunTimestamp = lastRunTimestamp;
    this.scheduleNextRun(lastRunTimestamp);
  }

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
