import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PluginCollectionAuditAction = 'LIST' | 'GET' | 'PUT' | 'DELETE';
export type PluginCollectionAuditOutcome =
  | 'SUCCESS'
  | 'AUTHORIZATION_DENIED'
  | 'VALIDATION_FAILED'
  | 'QUOTA_EXCEEDED';

@Entity('plugin_collection_audit_event')
@Index('idx_plugin_collection_audit_project_created', ['projectId', 'createdAt'])
@Index('idx_plugin_collection_audit_plugin_project_created', ['pluginId', 'projectId', 'createdAt'])
export class PluginCollectionAuditEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 36 }) pluginId: string;
  @Column({ type: 'varchar', length: 255 }) projectId: string;
  @Column({ type: 'varchar', length: 255 }) userId: string;
  @Column({ type: 'varchar', length: 36 }) installationId: string;
  @Column({ type: 'varchar', length: 64 }) collectionName: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) documentId: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) parentType: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) parentId: string | null;
  @Column({ type: 'varchar', length: 16 }) action: PluginCollectionAuditAction;
  @Column({ type: 'varchar', length: 32 }) outcome: PluginCollectionAuditOutcome;
  @Column({ type: 'json', nullable: true }) metadata: Record<string, unknown> | null;
  @CreateDateColumn() createdAt: Date;
}
