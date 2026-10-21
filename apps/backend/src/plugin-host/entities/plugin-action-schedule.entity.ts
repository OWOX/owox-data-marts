import { CronTime } from 'cron';
import { Column, Entity, Index } from 'typeorm';
import { ScheduledTrigger } from '../../common/scheduler/shared/entities/scheduled-trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { PluginScheduleDisabledReason } from '../enums/plugin-action-schedule.enum';
import { JSON_TEXT } from '../utils/json-text.transformer';

/** One installation's cron schedule of a backend action. No foreign keys, as on executions. */
@Entity('plugin_action_schedule')
@Index('idx_plugin_action_schedule_ready', ['isActive', 'status', 'nextRunTimestamp'])
@Index('idx_plugin_action_schedule_installation', ['installationId'])
export class PluginActionSchedule extends ScheduledTrigger {
  @Column({ type: 'varchar', length: 36 })
  pluginId: string;

  /** The owner is the installation's `userId`. */
  @Column({ type: 'varchar', length: 36 })
  installationId: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  /** `mediumtext` on MySQL, from the migration; declared `text` for TypeORM's SQLite driver. */
  @Column({ type: 'text', nullable: true, transformer: JSON_TEXT })
  parameters: unknown;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  disabledReason: PluginScheduleDisabledReason | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lastExecutionId: string | null;

  /** Transient: set by the handler, read by onSuccess/onError. */
  retryAt?: Date | null;

  /** Transient: the installation is uninstalled. */
  parked?: boolean;

  nextSlotAfter(after: Date): Date {
    const next = new CronTime(this.cronExpression, this.timeZone)
      .getNextDateFrom(after, this.timeZone)
      .toJSDate();
    if (next <= after) {
      throw new Error('Next run timestamp is in the past');
    }
    return next;
  }

  disable(reason: PluginScheduleDisabledReason): void {
    this.isActive = false;
    this.nextRunTimestamp = null;
    this.disabledReason = reason;
  }

  // Never super: its SUCCESS status or forced isActive would break writes that wait for IDLE.
  onSuccess(now: Date): void {
    this.settle(now);
  }

  onError(now: Date): void {
    this.settle(now);
  }

  private settle(now: Date): void {
    this.lastRunTimestamp = now;
    this.status = TriggerStatus.IDLE;
    if (!this.isActive || this.parked) {
      this.nextRunTimestamp = null;
      return;
    }
    const slot = this.nextSlotAfter(now);
    // However long the deployment sets the retry, it never skips a slot.
    this.nextRunTimestamp = this.retryAt && this.retryAt < slot ? this.retryAt : slot;
  }
}
