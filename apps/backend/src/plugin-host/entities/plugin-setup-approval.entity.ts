import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** App-only review of one actor's installation intent; contains references, never secrets. */
@Entity('plugin_setup_approval')
@Index('idx_plugin_setup_approval_member', ['projectId', 'userId', 'pluginId'])
export class PluginSetupApproval {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 255 }) projectId: string;
  @Column({ type: 'varchar', length: 255 }) userId: string;
  @Column({ type: 'varchar', length: 36 }) pluginId: string;
  @Column({ type: 'varchar', length: 36 }) versionId: string;
  @Column({ type: 'varchar', length: 255 }) operationId: string;
  @Column({ type: 'varchar', length: 16 }) purpose: 'install' | 'reconfigure';
  @Column({ type: 'integer' }) expectedRevision: number;
  @Column({ type: 'varchar', length: 16, default: 'pending' }) status:
    | 'pending'
    | 'completed'
    | 'revoked';
  @Column({ type: 'datetime' }) expiresAt: Date;
  @Column({ type: 'varchar', length: 36, nullable: true }) installationId: string | null;
  @Column({ type: 'integer', nullable: true }) completedRevision: number | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) selectionsDigest: string | null;
  @Column({ type: 'datetime', nullable: true }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
