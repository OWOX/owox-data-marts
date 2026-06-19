import type {
  McpOAuthProjectMemberContext,
  McpScope,
  McpTokenPayload,
  OAuthAuthorizationCode,
  OAuthAuthorizationRequest,
  OAuthJwksResult,
  OAuthTokenExchangeRequest,
  OAuthTokenExchangeResult,
} from '@owox/idp-protocol';

export const OAUTH_IDP_PORT = Symbol('OAUTH_IDP_PORT');

export interface OAuthIdpPort {
  createAuthorizationCode(
    request: OAuthAuthorizationRequest,
    projectMember: McpOAuthProjectMemberContext
  ): Promise<OAuthAuthorizationCode>;

  exchangeToken(request: OAuthTokenExchangeRequest): Promise<OAuthTokenExchangeResult>;

  verifyMcpToken(
    token: string,
    resource: string,
    requiredScopes: McpScope[]
  ): Promise<McpTokenPayload | null>;

  getJwks(): Promise<OAuthJwksResult>;
}
