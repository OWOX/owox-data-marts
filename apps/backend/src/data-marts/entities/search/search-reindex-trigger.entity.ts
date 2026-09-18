import { Column, Entity, Index } from 'typeorm';
import { Trigger } from '../../../common/scheduler/shared/entities/trigger.entity';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';

export type ReindexOperation = 'REINDEX' | 'DELETE' | 'REINDEX_REPORTS';

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

  @Column({ type: 'simple-json', nullable: true })
  reportProgress: { cursor: { createdAt: string; id: string } | null; errors: number } | null =
    null;

  override onSuccess(now = new Date()): void {
    if (this.operation === 'REINDEX_REPORTS' && this.reportProgress?.cursor) {
      this.status = TriggerStatus.IDLE;
      // Yield between pages so a large parent does not monopolize the fast queue.
      this.createdAt = now;
      return;
    }
    super.onSuccess(now);
  }
}
