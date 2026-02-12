import { Column, Entity } from 'typeorm';
import { Trigger } from '../../../common/scheduler/shared/entities/trigger.entity';

@Entity('sync_data_marts_by_gcp_triggers')
export class SyncDataMartsByGcpTrigger extends Trigger {
  @Column()
  gcpProjectId: string;

  @Column({ default: 0 })
  dataMartsCount: number;
}
