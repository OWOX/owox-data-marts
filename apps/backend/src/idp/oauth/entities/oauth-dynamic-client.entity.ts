import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { McpScope } from '@owox/idp-protocol';

export type OAuthDynamicClientStatus = 'pending' | 'success';

@Entity('oauth_dynamic_client')
export class OAuthDynamicClient {
  @PrimaryColumn({ type: 'varchar', length: '100' })
  clientId: string;

  @Column({ type: 'varchar', length: '255', nullable: true })
  clientName?: string | null;

  @Column({ type: 'varchar', length: '100', nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: '2048', nullable: true })
  resource?: string | null;

  @Column({ type: 'varchar', length: '20' })
  status: OAuthDynamicClientStatus;

  @Column({ type: 'json' })
  redirectUris: string[];

  @Column({ type: 'json' })
  scopes: McpScope[];

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt?: Date | null;
}
