import { Entity, Column } from 'typeorm';
import { Trigger } from '../../common/scheduler/shared/entities/trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';

@Entity('connector_run_triggers')
export class ConnectorRunTrigger extends Trigger {
  /**
   * Override to prevent deactivation when trigger is reset to IDLE due to concurrency limit.
   * When ConcurrencyLimitExceededException is caught, the handler sets status back to IDLE
   * so the trigger can be retried. We skip the default onSuccess behavior in this case
   * to keep the trigger active for the next processing cycle.
   */
  override onSuccess(_lastRunTimestamp?: Date) {
    if (this.status === TriggerStatus.IDLE) {
      return;
    }
    super.onSuccess(_lastRunTimestamp);
  }

  @Column()
  dataMartId: string;

  @Column()
  projectId: string;

  @Column()
  createdById: string;

  @Column({ type: 'json', nullable: true })
  payload?: Record<string, unknown> | null;

  @Column({ type: 'varchar' })
  dataMartRunId: string;

  @Column({ type: 'varchar' })
  runType: RunType;
}
