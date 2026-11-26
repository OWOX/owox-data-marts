import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { OwoxStorageLocation } from '../owox-storage/owox-storage-settings';

// MySQL returns bigint as a string.
const bytes = {
  to: (value: number | null) => value,
  from: (value: string | number | null) => (value == null ? null : Number(value)),
};

// One OWOX Storage per project in each location.
@Entity('managed_storage')
@Index('UQ_managed_storage_projectId_location', ['projectId', 'location'], { unique: true })
export class ManagedStorage {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  storageId: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 32 })
  engine: 'bigquery';

  @Column({ type: 'varchar', length: 255 })
  gcpProjectId: string;

  // Where the storage's jobs run; the datasets stay in gcpProjectId.
  @Column({ type: 'varchar', length: 255 })
  processProjectId: string;

  @Column({ type: 'varchar', length: 16 })
  location: OwoxStorageLocation;

  @Column({ type: 'varchar', length: 255 })
  datasetId: string;

  @Column({ type: 'varchar', length: 255 })
  internalDatasetId: string;

  @Column({ type: 'varchar', length: 255 })
  serviceAccountEmail: string;

  @Column({ type: 'bigint', nullable: true, transformer: bytes })
  storageLimitBytes: number | null;

  // Newest known use of the storage, for a future cleanup of unused storages.
  @Column({ type: 'datetime', nullable: true })
  lastActivityAt: Date | null;

  // Set when the storage was deleted for the customer.
  @Column({ type: 'datetime', nullable: true })
  deprovisionedAt: Date | null;

  // Set while Google resources of a deleted storage may remain; the daily job deletes them.
  @Column({ type: 'boolean', default: false })
  deprovisionPending: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
