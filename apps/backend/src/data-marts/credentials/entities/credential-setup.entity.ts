import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('credential_setup')
@Index('idx_credential_setup_created_at', ['createdAt'])
export class CredentialSetup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  mode: 'create' | 'update';

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: 'pending' | 'completed' | 'cancelled';

  @Column({ type: 'varchar', length: 255, nullable: true })
  definitionId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  credentialId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;
}
