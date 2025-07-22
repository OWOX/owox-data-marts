import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';

@Entity('magic_links')
export class MagicLink extends BaseEntity {
  @Column()
  @Index()
  email: string;

  @Column({ unique: true })
  @Index()
  token: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt?: Date;
}
