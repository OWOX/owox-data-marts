import { Column, Entity, Index } from 'typeorm';
import { Trigger } from '../../common/scheduler/shared/entities/trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';

@Entity('data_quality_run_triggers')
@Index('UQ_data_quality_run_trigger_run', ['dataMartRunId'], { unique: true })
export class DataQualityRunTrigger extends Trigger {
  override onSuccess(_lastRunTimestamp?: Date): void {
    if (this.status === TriggerStatus.IDLE || this.status === TriggerStatus.CANCELLED) {
      return;
    }
    super.onSuccess(_lastRunTimestamp);
  }

  @Column()
  createdById: string;

  @Column()
  projectId: string;

  @Column({ type: 'varchar' })
  dataMartRunId: string;

  @Column({ type: 'varchar' })
  runType: RunType;
}
