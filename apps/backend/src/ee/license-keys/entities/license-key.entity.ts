import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CreatorAwareEntity } from '../../../data-marts/entities/creator-aware-entity.interface';

@Entity('license_key')
@Index('idx_license_key_project_revoked', ['projectId', 'revokedAt'])
export class LicenseKey implements CreatorAwareEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  licenseKeyId: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  origin: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
