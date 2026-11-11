import { Injectable } from '@nestjs/common';
import { getMcpClientIntegration } from '../oauth/mcp-client-integration';
import { OAuthClientRegistry } from '../oauth/oauth-client.registry';
import type { McpClientFacade, McpClientIntegration } from './mcp-client.facade';

const MAX_CACHED_CLIENTS = 1000;

@Injectable()
export class McpClientFacadeImpl implements McpClientFacade {
  // Each MCP request asks, and redirect URIs do not change after registration.
  private readonly integrations = new Map<string, McpClientIntegration>();

  constructor(private readonly clients: OAuthClientRegistry) {}

  async getIntegration(clientId: string): Promise<McpClientIntegration> {
    const cached = this.integrations.get(clientId);
    if (cached) return cached;
    const client = await this.clients.get(clientId);
    const integration =
      client?.redirectUris
        .map(getMcpClientIntegration)
        .find(found => found !== 'owox-data-marts') ?? 'owox-data-marts';
    if (this.integrations.size >= MAX_CACHED_CLIENTS) {
      // Map keeps insertion order, so this drops the client cached first.
      this.integrations.delete(this.integrations.keys().next().value as string);
    }
    this.integrations.set(clientId, integration);
    return integration;
  }
}
