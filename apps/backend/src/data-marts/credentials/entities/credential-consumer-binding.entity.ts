import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CredentialConsumerType, NormalizedCredentialRequirement } from '../credential.types';

@Entity('credential_consumer_binding')
@Index('UQ_credential_consumer_requirement', ['consumerType', 'consumerId', 'requirementKey'], {
  unique: true,
})
@Index('idx_credential_binding_credential_active', ['credentialId', 'active'])
@Index('idx_credential_binding_consumer', ['consumerType', 'consumerId', 'active'])
export class CredentialConsumerBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 36 })
  credentialId: string;

  @Column({ type: 'varchar', length: 32 })
  consumerType: CredentialConsumerType;

  @Column({ type: 'varchar', length: 255 })
  consumerId: string;

  @Column({ type: 'varchar', length: 255 })
  requirementKey: string;

  @Column({ type: 'json' })
  requirementSnapshot: NormalizedCredentialRequirement;

  @Column({ type: 'varchar', length: 64 })
  requirementRevision: string;

  /** Audit metadata; removing this member never invalidates the project-owned binding. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  configuredById: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
