import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  CredentialAiModelMappings,
  CredentialAiModelMappingModes,
  CredentialAiModelMappingSources,
  CredentialDefinitionSource,
  CredentialSecret,
  CredentialValidationState,
} from '../credential.types';
import { CredentialContext } from './credential-context.entity';
import { CredentialOwner } from './credential-owner.entity';

@Entity('credential')
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 16 })
  definitionSource: CredentialDefinitionSource;

  /** Built-in definition id or stable external-definition row id. */
  @Column({ type: 'varchar', length: 255 })
  definitionId: string;

  /** Accepted major compatibility line for external definitions; null for built-ins. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  acceptedCompatibilityLine: string | null;

  /** Write-only at the API boundary. Kept in the main DB like Destination credentials. */
  @Column({ type: 'json' })
  secret: CredentialSecret;

  @Column({ type: 'json', nullable: true })
  aiModelMappings: CredentialAiModelMappings | null;

  @Column({ type: 'json', nullable: true })
  aiModelMappingModes: CredentialAiModelMappingModes | null;

  /** Distinguishes catalog selections from deliberate advanced manual model ids. */
  @Column({ type: 'json', nullable: true })
  aiModelMappingSources: CredentialAiModelMappingSources | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'boolean', default: true })
  availableForUse: boolean;

  @Column({ type: 'boolean', default: false })
  availableForMaintenance: boolean;

  @Column({ type: 'varchar', length: 16, default: 'unknown' })
  validationState: CredentialValidationState;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  validationMessage: string | null;

  @Column({ type: 'datetime', nullable: true })
  validatedAt: Date | null;

  /** Audit metadata only. The credential belongs to the project, not this member. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  createdById: string | null;

  @OneToMany(() => CredentialOwner, owner => owner.credential)
  owners: CredentialOwner[];

  @OneToMany(() => CredentialContext, context => context.credential)
  contexts: CredentialContext[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  get ownerIds(): string[] {
    return (this.owners ?? []).map(owner => owner.userId);
  }

  get contextIds(): string[] {
    return (this.contexts ?? []).map(context => context.contextId);
  }
}
