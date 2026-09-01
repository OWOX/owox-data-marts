import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CredentialDefinitionContract } from '../credential.types';

@Entity('credential_definition_version')
@Index('UQ_credential_definition_version_semver', ['externalDefinitionId', 'semver'], {
  unique: true,
})
export class CredentialDefinitionVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  externalDefinitionId: string;

  @Column({ type: 'varchar', length: 32 })
  semver: string;

  @Column({ type: 'varchar', length: 32 })
  compatibilityLine: string;

  @Column({ type: 'varchar', length: 40 })
  commitSha: string;

  @Column({ type: 'varchar', length: 20 })
  githubReleaseId: string;

  @Column({ type: 'varchar', length: 255 })
  tagName: string;

  @Column({ type: 'json' })
  contract: CredentialDefinitionContract;

  @CreateDateColumn()
  createdAt: Date;
}
