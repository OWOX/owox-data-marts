import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DataStorage } from './data-storage.entity';
import { Context } from './context.entity';

@Entity('storage_contexts')
export class StorageContext {
  @PrimaryColumn({ name: 'storage_id' })
  storageId: string;

  @PrimaryColumn({ name: 'context_id' })
  contextId: string;

  @ManyToOne(() => DataStorage, storage => storage.contexts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storage_id' })
  storage: DataStorage;

  @ManyToOne(() => Context, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'context_id' })
  context: Context;
}
