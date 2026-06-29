import { Column, Entity, Index } from 'typeorm';
import { Trigger } from '../../../common/scheduler/shared/entities/trigger.entity';

export type ReindexOperation = 'REINDEX' | 'DELETE';

@Entity('search_reindex_triggers')
@Index('idx_search_reindex_trigger_ready', ['isActive', 'status'])
@Index('idx_search_reindex_trigger_entity', ['entityType', 'entityId', 'status'])
export class SearchReindexTrigger extends Trigger {
  @Column()
  projectId: string;

  @Column({ length: 64 })
  entityType: string;

  @Column({ type: 'varchar', length: 36 })
  entityId: string;

  @Column({ type: 'varchar', length: 16 })
  operation: ReindexOperation;
}
