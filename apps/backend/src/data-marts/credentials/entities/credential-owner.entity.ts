import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Credential } from './credential.entity';

@Entity('credential_owners')
export class CredentialOwner {
  @PrimaryColumn({ name: 'credential_id', type: 'varchar', length: 36 })
  credentialId: string;

  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @ManyToOne(() => Credential, credential => credential.owners, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'credential_id' })
  credential: Credential;
}
