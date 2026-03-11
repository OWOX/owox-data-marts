import { Entity, Column } from 'typeorm';
import { Trigger } from '../../common/scheduler/shared/entities/trigger.entity';
import { RunType } from '../../common/scheduler/shared/types';

@Entity('report_run_triggers')
export class ReportRunTrigger extends Trigger {
  @Column()
  reportId: string;

  @Column()
  userId: string;

  @Column()
  projectId: string;

  @Column({ type: 'varchar', nullable: true })
  dataMartRunId?: string | null;

  @Column({ type: 'varchar' })
  runType: RunType;
}
