import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'data_storage_search_index' })
@Index('idx_data_storage_search_index_project', ['projectId'])
@Index('idx_data_storage_search_index_project_entity', ['projectId', 'entityId'])
export class DataStorageSearchIndex {
  @PrimaryColumn({ type: 'varchar', length: 36, name: 'entity_id' })
  entityId: string;

  @Column({ type: 'varchar', length: 255, name: 'project_id' })
  projectId: string;

  @Column({ type: 'blob', nullable: true })
  embedding: Buffer | null;

  @Column({ type: 'varchar', length: 16, name: 'embedding_status', default: 'MISSING' })
  embeddingStatus: string;

  @Column({ type: 'text', nullable: true })
  document: string | null;

  @Column({ type: 'text', name: 'search_text', nullable: true })
  searchText: string | null;

  @Column({ type: 'varchar', length: 64, name: 'doc_hash' })
  docHash: string;

  @Column({ type: 'datetime', name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
