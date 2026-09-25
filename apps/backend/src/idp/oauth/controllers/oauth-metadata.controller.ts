import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
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
  constructor(
    private readonly config: OAuthConfigService,
    private readonly resourceResolver: McpResourceResolverService
  ) {}

  @Get(AUTHORIZATION_SERVER_METADATA_PATHS)
  getAuthorizationServerMetadata(@Req() request?: Request) {
    return this.getBaseMetadata(request);
  }

  @Get(OPENID_CONFIGURATION_PATHS)
  getOpenIdConfigurationMetadata(@Req() request?: Request) {
    return {
      ...this.getBaseMetadata(request),
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    };
  }

  private getBaseMetadata(request?: Request) {
    const resourceContext = request ? this.resourceResolver.tryResolveRequest(request) : null;
    const issuer = resourceContext?.publicBaseUrl ?? this.config.issuer;

    return {
      issuer,
      authorization_endpoint: this.config.authorizationEndpoint,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      jwks_uri: `${issuer}/oauth/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: this.config.scopes,
      token_endpoint_auth_methods_supported: ['none'],
      // RFC 9207: only project-specific issuers need this — their authorization_endpoint lives on
      // a different origin (app.owox.com) than the issuer, which is exactly the split-origin case
      // issuer-bound callbacks (e.g. Codex) refuse without it. The shared MCP host's issuer and
      // authorization_endpoint already share one origin, so it has nothing to prove here.
      ...(resourceContext?.kind === 'project'
        ? { authorization_response_iss_parameter_supported: true }
        : {}),
    };
  }
}
