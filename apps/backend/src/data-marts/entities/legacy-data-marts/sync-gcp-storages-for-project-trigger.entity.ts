import { Column, Entity } from 'typeorm';
import { Trigger } from '../../../common/scheduler/shared/entities/trigger.entity';

@Entity('sync_gcp_storages_for_project_triggers')
export class SyncGcpStoragesForProjectTrigger extends Trigger {
  @Column()
  projectId: string;

  @Column({ default: 0 })
  gcpProjectsCount: number;
}
