import { ConfigService } from '@nestjs/config';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
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
    const resolver = new McpResourceResolverService(
      new ConfigService({
        MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com',
        MCP_OAUTH_RESOURCE: 'https://mcp.owox.com/mcp',
      })
    );

    return new (OAuthMetadataController as unknown as new (
      ...args: unknown[]
    ) => OAuthMetadataController)(config, resolver);
  }

  it('returns authorization-server metadata from config', () => {
    const controller = createController();
    expect(
      controller.getAuthorizationServerMetadata({ headers: { host: 'app.owox.com' } } as never)
    ).toEqual({
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

    expect(
      controller.getOpenIdConfigurationMetadata({ headers: { host: 'app.owox.com' } } as never)
    ).toEqual({
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

  it('uses project host as authorization server when metadata is requested from a project host', () => {
    const controller = createController();
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';

    expect(
      controller.getAuthorizationServerMetadata({
        protocol: 'https',
        host: `${projectId}.mcp.owox.com`,
        headers: { host: `${projectId}.mcp.owox.com` },
      } as never)
    ).toMatchObject({
      issuer: `https://${projectId}.mcp.owox.com`,
      authorization_endpoint: 'https://app.owox.com/oauth/authorize',
      token_endpoint: `https://${projectId}.mcp.owox.com/oauth/token`,
      registration_endpoint: `https://${projectId}.mcp.owox.com/oauth/register`,
    });
  });

  it('keeps authorize on the app host for shared MCP metadata in split production config', () => {
    const controller = createController();

    expect(
      controller.getAuthorizationServerMetadata({
        protocol: 'https',
        host: 'mcp.owox.com',
        headers: { host: 'mcp.owox.com' },
      } as never)
    ).toMatchObject({
      issuer: 'https://mcp.owox.com',
      authorization_endpoint: 'https://app.owox.com/oauth/authorize',
      token_endpoint: 'https://mcp.owox.com/oauth/token',
      registration_endpoint: 'https://mcp.owox.com/oauth/register',
      jwks_uri: 'https://mcp.owox.com/oauth/jwks',
    });
  });
});
