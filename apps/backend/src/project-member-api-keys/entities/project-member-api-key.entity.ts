import type { Role } from '@owox/idp-protocol';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('project_member_api_key')
@Index('idx_project_member_api_key_apiKeyId', ['apiKeyId'])
@Index('idx_project_member_api_key_project_user_revoked', ['projectId', 'userId', 'revokedAt'])
export class ProjectMemberApiKey {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  apiKeyId: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  role: Role | null;

  @Column({ type: 'boolean', default: false })
  readOnly: boolean;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastAuthenticatedAt: Date | null;

  @Column({ type: 'varchar', length: 255 })
  keyHash: string;

  @Column({ type: 'varchar', length: 64 })
  keyHashSalt: string;

  @Column({ type: 'json' })
  keyHashParams: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
