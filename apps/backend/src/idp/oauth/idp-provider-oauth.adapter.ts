import { Injectable } from '@nestjs/common';
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
import { IdpProviderService } from '../services/idp-provider.service';
import { OAuthIdpPort } from './oauth-idp.port';

@Injectable()
export class IdpProviderOAuthAdapter implements OAuthIdpPort {
  constructor(private readonly idpProviderService: IdpProviderService) {}

  createAuthorizationCode(
    request: OAuthAuthorizationRequest,
    projectMember: McpOAuthProjectMemberContext
  ): Promise<OAuthAuthorizationCode> {
    return this.idpProviderService
      .getProviderFromApp()
      .createMcpOAuthAuthorizationCode(request, projectMember);
  }

  exchangeToken(request: OAuthTokenExchangeRequest): Promise<OAuthTokenExchangeResult> {
    return this.idpProviderService.getProviderFromApp().exchangeMcpOAuthToken(request);
  }

  verifyMcpToken(
    token: string,
    resource: string,
    requiredScopes: McpScope[]
  ): Promise<McpTokenPayload | null> {
    return this.idpProviderService
      .getProviderFromApp()
      .verifyMcpAccessToken(token, resource, requiredScopes);
  }

  getJwks(): Promise<OAuthJwksResult> {
    return this.idpProviderService.getProviderFromApp().getMcpOAuthJwks();
  }
}
