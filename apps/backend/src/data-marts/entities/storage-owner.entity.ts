import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DataStorage } from './data-storage.entity';

@Entity('storage_owners')
export class StorageOwner {
  @PrimaryColumn({ name: 'storage_id' })
  storageId: string;

  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => DataStorage, storage => storage.owners, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storage_id' })
  storage: DataStorage;
}
