import { OAuthConfigService } from '../oauth-config.service';
import { OAuthMetadataController } from './oauth-metadata.controller';

describe('OAuthMetadataController', () => {
  function createController() {
    const config = {
      issuer: 'https://app.owox.com',
      authorizationEndpoint: 'https://app.owox.com/oauth/authorize',
      tokenEndpoint: 'https://app.owox.com/oauth/token',
      registrationEndpoint: 'https://app.owox.com/oauth/register',
      jwksEndpoint: 'https://app.owox.com/oauth/jwks',
      scopes: ['mcp:read', 'mcp:write'],
    } as OAuthConfigService;

    return new OAuthMetadataController(config);
  }

  it('returns authorization-server metadata from config', () => {
    const controller = createController();
    expect(controller.getAuthorizationServerMetadata()).toEqual({
      issuer: 'https://app.owox.com',
      authorization_endpoint: 'https://app.owox.com/oauth/authorize',
      token_endpoint: 'https://app.owox.com/oauth/token',
      registration_endpoint: 'https://app.owox.com/oauth/register',
      jwks_uri: 'https://app.owox.com/oauth/jwks',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp:read', 'mcp:write'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });

  it('returns OpenID configuration compatibility metadata from config', () => {
    const controller = createController();

    expect(controller.getOpenIdConfigurationMetadata()).toEqual({
      issuer: 'https://app.owox.com',
      authorization_endpoint: 'https://app.owox.com/oauth/authorize',
      token_endpoint: 'https://app.owox.com/oauth/token',
      registration_endpoint: 'https://app.owox.com/oauth/register',
      jwks_uri: 'https://app.owox.com/oauth/jwks',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp:read', 'mcp:write'],
      token_endpoint_auth_methods_supported: ['none'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    });
  });
});
