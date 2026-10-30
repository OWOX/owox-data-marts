import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { OwoxStorageLocation } from '../owox-storage/owox-storage-settings';

// MySQL returns bigint as a string.
const bytes = {
  to: (value: number | null) => value,
  from: (value: string | number | null) => (value == null ? null : Number(value)),
};

@Entity('managed_storage')
export class ManagedStorage {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  storageId: string;

  @Index('UQ_managed_storage_projectId', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 32 })
  engine: 'bigquery';

  @Column({ type: 'varchar', length: 255 })
  gcpProjectId: string;

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

  @Column({ type: 'bigint', nullable: true, transformer: bytes })
  queryLimitBytesPerDay: number | null;

  @Column({ type: 'datetime', nullable: true })
  notPaidSince: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
