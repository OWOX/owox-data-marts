import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { MCP_CLIENT_FACADE, type McpClientFacade } from '../../../idp/facades/mcp-client.facade';
import { OAUTH_IDP_PORT, type OAuthIdpPort } from '../../../idp/oauth/oauth-idp.port';
import type { McpAuthContext } from './mcp-auth-context';
import type { McpAuthPort } from './mcp-auth.port';

@Injectable()
export class IdpMcpAuthAdapter implements McpAuthPort {
  constructor(
    @Inject(OAUTH_IDP_PORT)
    private readonly oauthIdp: OAuthIdpPort,
    @Inject(MCP_CLIENT_FACADE)
    private readonly clients: McpClientFacade
  ) {}

  async verifyToken(
    token: string,
    resource: string,
    requiredScopes: McpScope[]
  ): Promise<McpAuthContext | null> {
    const payload = await this.oauthIdp.verifyMcpToken(token, resource, requiredScopes);
    return (
      payload && { ...payload, integration: await this.clients.getIntegration(payload.clientId) }
    );
  }
}
