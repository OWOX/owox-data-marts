import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import type { CredentialIdentity } from '../entities/credential-identity.type';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';

@Entity('data_destination_credentials')
export class DataDestinationCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdById?: string | null;

  @Column({ type: 'varchar', length: 50 })
  type: DestinationCredentialType;

  @Column({ type: 'json' })
  credentials: StoredDestinationCredentials;

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
