import { Body, Controller, Inject, Post } from '@nestjs/common';
import { OAuthClientRegistry } from '../oauth-client.registry';
import { OAuthIdpPort, OAUTH_IDP_PORT } from '../oauth-idp.port';
import { OAuthRequestValidator } from '../oauth-request.validator';

@Controller('/oauth')
export class OAuthTokenController {
  constructor(
    private readonly validator: OAuthRequestValidator,
    @Inject(OAUTH_IDP_PORT) private readonly oauthIdp: OAuthIdpPort,
    private readonly clientRegistry: OAuthClientRegistry
  ) {}

  @Post('/token')
  async token(@Body() body: Record<string, unknown>) {
    const request = await this.validator.validateTokenRequest(body);
    const result = await this.oauthIdp.exchangeToken(request);
    await this.clientRegistry.markSuccessfulTokenExchange(request.clientId);
    return result;
  }
}
