import { Controller, Get } from '@nestjs/common';
import { OAuthConfigService } from '../oauth-config.service';

const AUTHORIZATION_SERVER_METADATA_PATHS = [
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/mcp',
  '/mcp/.well-known/oauth-authorization-server',
];

const OPENID_CONFIGURATION_PATHS = [
  '/.well-known/openid-configuration',
  '/.well-known/openid-configuration/mcp',
  '/mcp/.well-known/openid-configuration',
];

@Controller()
export class OAuthMetadataController {
  constructor(private readonly config: OAuthConfigService) {}

  @Get(AUTHORIZATION_SERVER_METADATA_PATHS)
  getAuthorizationServerMetadata() {
    return this.getBaseMetadata();
  }

  @Get(OPENID_CONFIGURATION_PATHS)
  getOpenIdConfigurationMetadata() {
    return {
      ...this.getBaseMetadata(),
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    };
  }

  private getBaseMetadata() {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: this.config.authorizationEndpoint,
      token_endpoint: this.config.tokenEndpoint,
      registration_endpoint: this.config.registrationEndpoint,
      jwks_uri: this.config.jwksEndpoint,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: this.config.scopes,
      token_endpoint_auth_methods_supported: ['none'],
    };
  }
}
