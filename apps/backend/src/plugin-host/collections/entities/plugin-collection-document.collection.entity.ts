import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plugin_collection_document')
@Index('UQ_plugin_collection_document_namespace_key', ['namespaceKey', 'documentKey'], {
  unique: true,
})
@Index('idx_plugin_collection_document_parent', ['namespaceKey', 'parentId'])
export class PluginCollectionDocument {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 64 }) namespaceKey: string;
  /** SHA-256 of documentId: byte-exact identity independent of database collation. */
  @Column({ type: 'varchar', length: 64 }) documentKey: string;
  @Column({ type: 'varchar', length: 36 }) pluginId: string;
  @Column({ type: 'varchar', length: 255 }) projectId: string;
  @Column({ type: 'varchar', length: 16 }) scope: 'project' | 'member';
  @Column({ type: 'varchar', length: 255, nullable: true }) memberId: string | null;
  @Column({ type: 'varchar', length: 64 }) collectionName: string;
  @Column({ type: 'varchar', length: 200 }) documentId: string;
  @Column({ type: 'varchar', length: 32, nullable: true }) parentType: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) parentId: string | null;
  @Column({ type: 'json' }) document: unknown;
  @Column({ type: 'int', unsigned: true }) documentSizeBytes: number;
  @Column({ type: 'varchar', length: 255 }) createdByUserId: string;
  @Column({ type: 'varchar', length: 255 }) modifiedByUserId: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() modifiedAt: Date;
}
