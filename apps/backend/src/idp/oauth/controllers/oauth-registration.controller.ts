import { Body, Controller, Post } from '@nestjs/common';
import {
  OAuthDynamicClientRegistrationRequest,
  OAuthDynamicClientService,
} from '../oauth-dynamic-client.service';

@Controller('/oauth')
export class OAuthRegistrationController {
  constructor(private readonly dynamicClientService: OAuthDynamicClientService) {}

  @Post('/register')
  register(@Body() body: OAuthDynamicClientRegistrationRequest) {
    return this.dynamicClientService.register(body);
  }
}
