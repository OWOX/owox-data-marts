import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, McpTokenPayload } from '@owox/idp-protocol';
import { OAUTH_IDP_PORT, type OAuthIdpPort } from '../../../idp/oauth/oauth-idp.port';
import type { McpAuthPort } from './mcp-auth.port';

@Injectable()
export class IdpMcpAuthAdapter implements McpAuthPort {
  constructor(
    @Inject(OAUTH_IDP_PORT)
    private readonly oauthIdp: OAuthIdpPort
  ) {}

  verifyToken(
    token: string,
    resource: string,
    requiredScopes: McpScope[]
  ): Promise<McpTokenPayload | null> {
    return this.oauthIdp.verifyMcpToken(token, resource, requiredScopes);
  }
}
