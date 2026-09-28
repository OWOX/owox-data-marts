import { Body, Controller, HttpException, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { OAuthTokenExchangeResult } from '@owox/idp-protocol';
import type { Request } from 'express';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import { isAuthenticationError } from '../../utils/is-authentication-error';
import { OAuthClientRegistry } from '../oauth-client.registry';
import { OAuthIdpPort, OAUTH_IDP_PORT } from '../oauth-idp.port';
import { OAuthRequestValidator } from '../oauth-request.validator';

@Controller('/oauth')
export class OAuthTokenController {
  constructor(
    private readonly validator: OAuthRequestValidator,
    @Inject(OAUTH_IDP_PORT) private readonly oauthIdp: OAuthIdpPort,
    private readonly clientRegistry: OAuthClientRegistry,
    private readonly resourceResolver: McpResourceResolverService
  ) {}

  @Post('/token')
  async token(@Body() body: Record<string, unknown>, @Req() request: Request) {
    const requestResource = this.resourceResolver.tryResolveRequest(request)?.resource;
    const validated = await this.validator.validateTokenRequest(body, requestResource);
    const tokenRequest = validated.request;

    let result: OAuthTokenExchangeResult;
    try {
      result = await this.oauthIdp.exchangeToken(tokenRequest);
    } catch (error) {
      // IB reports an expired/invalid MCP refresh (or authorization-code) grant as a plain 401.
      // Surface it as a proper OAuth `invalid_grant` instead of letting it fall through to the
      // catch-all filter's generic 500 — that 500 stops MCP clients from recognizing the grant
      // is dead and restarting authorization. Any other failure (timeout, C2C outage, IB 5xx)
      // is not an AuthenticationException and rethrows unchanged, keeping today's 5xx behavior.
      if (isAuthenticationError(error)) {
        throw new HttpException(
          {
            error: 'invalid_grant',
            error_description:
              'The provided authorization grant or refresh token is invalid or expired.',
          },
          HttpStatus.BAD_REQUEST
        );
      }
      throw error;
    }

    await this.clientRegistry.markSuccessfulTokenExchange(tokenRequest.clientId);
    return result;
  }
}
