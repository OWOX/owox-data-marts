import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import type { CredentialIdentity } from '../entities/credential-identity.type';
import type { StoredStorageCredentials } from '../entities/stored-storage-credentials.type';

@Entity('data_storage_credentials')
export class DataStorageCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdById?: string | null;

  @Column({ type: 'varchar', length: 50 })
  type: StorageCredentialType;

  @Column({ type: 'json' })
  credentials: StoredStorageCredentials;

  @Column({ type: 'json', nullable: true })
  identity?: CredentialIdentity | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
