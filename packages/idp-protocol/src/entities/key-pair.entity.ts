import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';

@Entity('key_pairs')
export class KeyPair extends BaseEntity {
  @Column({ unique: true })
  @Index()
  kid: string;

  @Column({ type: 'text' })
  publicKey: string;

  @Column({ type: 'text' })
  privateKey: string;

  @Column()
  algorithm: 'RS256' | 'ES256';

  @Column({ default: false })
  @Index({ where: 'is_active = TRUE' })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt?: Date;
}
