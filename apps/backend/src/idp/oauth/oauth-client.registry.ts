import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { McpScope } from '@owox/idp-protocol';
import { IsNull, Repository } from 'typeorm';
import {
  OAuthDynamicClient,
  type OAuthDynamicClientStatus,
} from './entities/oauth-dynamic-client.entity';

export interface OAuthRegisteredClient {
  clientId: string;
  clientName?: string;
  userId?: string;
  status?: OAuthDynamicClientStatus;
  redirectUris: string[];
  scopes: McpScope[];
  createdAt: Date;
  lastUsedAt?: Date;
}

@Injectable()
export class OAuthClientRegistry {
  constructor(
    @InjectRepository(OAuthDynamicClient)
    private readonly repository: Repository<OAuthDynamicClient>
  ) {}

  async register(client: OAuthRegisteredClient): Promise<OAuthRegisteredClient> {
    await this.repository.save({
      clientId: client.clientId,
      clientName: client.clientName ?? null,
      userId: client.userId ?? null,
      status: client.status ?? 'pending',
      redirectUris: client.redirectUris,
      scopes: client.scopes,
      createdAt: client.createdAt,
      lastUsedAt: client.lastUsedAt ?? null,
    });
    return client;
  }

  async get(clientId: string): Promise<OAuthRegisteredClient | undefined> {
    const client = await this.repository.findOne({ where: { clientId } });
    return client ? this.toRegisteredClient(client) : undefined;
  }

  async hasRedirectUri(clientId: string, redirectUri: string): Promise<boolean> {
    return (await this.get(clientId))?.redirectUris.includes(redirectUri) ?? false;
  }

  async attachUserIfMissing(clientId: string, userId: string): Promise<void> {
    await this.repository.update({ clientId, userId: IsNull() }, { userId });
  }

  async markSuccessfulTokenExchange(clientId: string, usedAt: Date = new Date()): Promise<void> {
    await this.repository.update({ clientId }, { status: 'success', lastUsedAt: usedAt });
  }

  private toRegisteredClient(client: OAuthDynamicClient): OAuthRegisteredClient {
    return {
      clientId: client.clientId,
      clientName: client.clientName ?? undefined,
      userId: client.userId ?? undefined,
      status: client.status,
      redirectUris: client.redirectUris,
      scopes: client.scopes,
      createdAt: client.createdAt,
      lastUsedAt: client.lastUsedAt ?? undefined,
    };
  }
}
