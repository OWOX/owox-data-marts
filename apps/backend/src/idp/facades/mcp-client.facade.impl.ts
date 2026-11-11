import { Injectable } from '@nestjs/common';
import { getMcpClientIntegration } from '../oauth/mcp-client-integration';
import { OAuthClientRegistry } from '../oauth/oauth-client.registry';
import type { McpClientFacade, McpClientIntegration } from './mcp-client.facade';

@Injectable()
export class McpClientFacadeImpl implements McpClientFacade {
  constructor(private readonly clients: OAuthClientRegistry) {}

  async getIntegration(clientId: string): Promise<McpClientIntegration> {
    const client = await this.clients.get(clientId);
    return (
      client?.redirectUris
        .map(getMcpClientIntegration)
        .find(integration => integration !== 'owox-data-marts') ?? 'owox-data-marts'
    );
  }
}
