import { Controller, Get, Inject } from '@nestjs/common';
import { OAuthIdpPort, OAUTH_IDP_PORT } from '../oauth-idp.port';

@Controller('/oauth')
export class OAuthJwksController {
  constructor(@Inject(OAUTH_IDP_PORT) private readonly oauthIdp: OAuthIdpPort) {}

  @Get('/jwks')
  getJwks() {
    return this.oauthIdp.getJwks();
  }
}
