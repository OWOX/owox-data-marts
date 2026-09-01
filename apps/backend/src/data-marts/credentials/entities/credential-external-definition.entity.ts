import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('credential_external_definition')
@Index('UQ_credential_external_definition_repo', ['githubRepoId'], {
  unique: true,
})
@Index('idx_credential_external_definition_next_sync', ['nextSyncAt'])
export class CredentialExternalDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable across a GitHub repository rename or transfer. */
  @Column({ type: 'varchar', length: 20 })
  githubRepoId: string;

  @Column({ type: 'varchar', length: 255 })
  repoOwner: string;

  @Column({ type: 'varchar', length: 255 })
  repoName: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  currentVersionId: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  currentCompatibilityLine: string | null;

  @Column({ type: 'json', nullable: true })
  lastSyncSummary: Record<string, unknown> | null;

  @Column({ type: 'datetime', nullable: true })
  nextSyncAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
