import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { User } from './user.entity.js';

@Entity('oauth_accounts')
@Unique(['provider', 'providerUserId'])
export class OAuthAccount extends BaseEntity {
  @ManyToOne(() => User, user => user.oauthAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  provider: string;

  @Column({ name: 'provider_user_id' })
  providerUserId: string;

  @Column({ nullable: true })
  accessToken?: string;

  @Column({ nullable: true })
  refreshToken?: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;
}
