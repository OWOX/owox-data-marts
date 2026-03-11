import { Entity, Column } from 'typeorm';
import { Trigger } from '../../common/scheduler/shared/entities/trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';

@Entity('report_run_triggers')
export class ReportRunTrigger extends Trigger {
  override onSuccess(_lastRunTimestamp?: Date) {
    if (this.status === TriggerStatus.IDLE) {
      return;
    }
    super.onSuccess(_lastRunTimestamp);
  }

  @Column()
  reportId: string;

  @Column()
  userId: string;

  @Column()
  projectId: string;

  @Column({ type: 'varchar' })
  dataMartRunId: string;

  @Column({ type: 'varchar' })
  runType: RunType;
}
