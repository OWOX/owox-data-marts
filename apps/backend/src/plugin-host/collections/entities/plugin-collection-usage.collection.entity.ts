import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type PluginCollectionUsageLevel = 'namespace' | 'plugin-project' | 'project';

@Entity('plugin_collection_usage')
@Index('idx_plugin_collection_usage_project', ['projectId', 'level'])
export class PluginCollectionUsage {
  @PrimaryColumn({ type: 'varchar', length: 64 }) usageKey: string;
  @Column({ type: 'varchar', length: 32 }) level: PluginCollectionUsageLevel;
  @Column({ type: 'varchar', length: 36, nullable: true }) pluginId: string | null;
  @Column({ type: 'varchar', length: 255 }) projectId: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) namespaceKey: string | null;
  @Column({ type: 'int', unsigned: true, default: 0 }) documentCount: number;
  /** TypeORM returns BIGINT as a string in both supported drivers. */
  @Column({ type: 'bigint', unsigned: true, default: 0 }) totalBytes: string;
  @UpdateDateColumn() modifiedAt: Date;
}
