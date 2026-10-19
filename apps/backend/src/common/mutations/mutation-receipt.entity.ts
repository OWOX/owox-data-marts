import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export interface MutationResultReference {
  resourceId: string;
  revision?: number;
  runId?: string;
  triggerId?: string;
  versionId?: string;
  state?: string;
  deleted?: boolean;
}

@Entity('mutation_receipt')
export class MutationReceipt {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Index('IDX_mutation_receipt_identity', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  identityHash: string;

  @Column({ type: 'varchar', length: 64 })
  intentHash: string;

  @Column({ type: 'varchar', length: 16 })
  status: 'incomplete' | 'unknown' | 'completed';

  @Column({ type: 'simple-json', nullable: true })
  result: MutationResultReference | null;

  @CreateDateColumn()
  createdAt: Date;
}
