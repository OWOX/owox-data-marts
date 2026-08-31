import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { ConnectorDefinition } from './connector-definition.entity';

export enum ConnectorDefinitionVersionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

/**
 * Both indexes and the foreign key mirror 1788048000000-create-connector-definition-tables
 * exactly, and have to keep doing so. `migration:generate` diffs entity metadata against the
 * live schema and writes what would make the database match the ENTITIES, so anything the
 * migration creates but no entity declares is emitted as a DROP in the next generated
 * migration -- see the regeneration case in connector-definition-tables.migration.spec.ts.
 */
@Entity()
@Index('IDX_connector_definition_version_definitionId', ['connectorDefinitionId'])
// saveDraft() derives the next version number from the current latest row, so two concurrent
// saves compute the same number. The database is what keeps them apart.
@Index(
  'IDX_connector_definition_version_definitionId_version',
  ['connectorDefinitionId', 'version'],
  { unique: true }
)
export class ConnectorDefinitionVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  connectorDefinitionId: string;

  /**
   * NO ACTION, not CASCADE: connector definitions are soft-deleted, never hard-deleted, so a
   * cascade would only ever fire on a delete that is not supposed to happen -- and would take
   * the version history with it.
   */
  @ManyToOne(() => ConnectorDefinition, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({ name: 'connectorDefinitionId' })
  connectorDefinition: ConnectorDefinition;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'json' })
  manifest: Record<string, unknown>;

  @Column({ default: ConnectorDefinitionVersionStatus.DRAFT })
  status: ConnectorDefinitionVersionStatus;

  @Column({ type: 'varchar', nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  publishedAt?: Date | null;
}
