import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Context } from '../../entities/context.entity';
import { Credential } from './credential.entity';

@Entity('credential_contexts')
@Index('idx_credential_context_context', ['contextId'])
export class CredentialContext {
  @PrimaryColumn({ name: 'credential_id', type: 'varchar', length: 36 })
  credentialId: string;

  @PrimaryColumn({ name: 'context_id', type: 'varchar', length: 36 })
  contextId: string;

  @ManyToOne(() => Credential, credential => credential.contexts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'credential_id' })
  credential: Credential;

  @ManyToOne(() => Context, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'context_id' })
  context: Context;
}
