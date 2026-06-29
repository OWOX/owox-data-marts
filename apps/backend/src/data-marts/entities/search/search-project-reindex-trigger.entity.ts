import { Column, Entity, Index } from 'typeorm';
import { Trigger } from '../../../common/scheduler/shared/entities/trigger.entity';

export abstract class SearchProjectReindexTrigger extends Trigger {
  @Column()
  projectId: string;
}

@Entity('search_data_mart_project_reindex_triggers')
@Index('idx_search_data_mart_project_reindex_trigger_ready', ['isActive', 'status'])
@Index('idx_search_data_mart_project_reindex_trigger_project', ['projectId', 'status'])
export class SearchDataMartProjectReindexTrigger extends SearchProjectReindexTrigger {}

@Entity('search_data_storage_project_reindex_triggers')
@Index('idx_search_data_storage_project_reindex_trigger_ready', ['isActive', 'status'])
@Index('idx_search_data_storage_project_reindex_trigger_project', ['projectId', 'status'])
export class SearchDataStorageProjectReindexTrigger extends SearchProjectReindexTrigger {}

@Entity('search_data_destination_project_reindex_triggers')
@Index('idx_search_data_destination_project_reindex_trigger_ready', ['isActive', 'status'])
@Index('idx_search_data_destination_project_reindex_trigger_project', ['projectId', 'status'])
export class SearchDataDestinationProjectReindexTrigger extends SearchProjectReindexTrigger {}
