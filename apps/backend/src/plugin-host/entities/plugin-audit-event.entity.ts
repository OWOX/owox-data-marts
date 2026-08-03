import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';

/**
 * Append-only audit trail for security-significant plugin lifecycle actions.
 *
 * A table rather than domain events alone: the external event bus is frequently
 * unconfigured in self-managed deployments, and this history must never be lost or
 * hard-deleted. Both are written -- the table is the durable record, the event is the
 * integration hook.
 *
 * Credentials and GitHub tokens are never written here.
 */
@Entity('plugin_audit_event')
@Index('idx_plugin_audit_plugin', ['pluginId', 'createdAt'])
export class PluginAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  pluginId: string;

  @Column({ type: 'varchar', length: 64 })
  action: PluginAuditAction;

  /** The authority the actor used. */
  @Column({ type: 'varchar', length: 16 })
  authorityScope: PluginPublicationScope;

  @Column({ type: 'varchar', length: 255, nullable: true })
  projectId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  apiKeyId: string | null;

  @Column({ type: 'json', nullable: true })
  beforeState: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  afterState: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
