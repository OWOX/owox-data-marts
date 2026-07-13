import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { McpScope } from '@owox/idp-protocol';
import { OAuthClientRegistry } from './oauth-client.registry';
import { OAuthConfigService } from './oauth-config.service';

export interface OAuthDynamicClientRegistrationRequest {
  redirect_uris?: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
}

export interface OAuthDynamicClientRegistrationResponse {
  client_id: string;
  client_id_issued_at: number;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none';
  scope: string;
}

@Injectable()
export class OAuthDynamicClientService {
  constructor(
    private readonly config: OAuthConfigService,
    private readonly clientRegistry: OAuthClientRegistry
  ) {}

  async register(
    request: OAuthDynamicClientRegistrationRequest,
    resource: string
  ): Promise<OAuthDynamicClientRegistrationResponse> {
    if (!this.config.isDynamicClientRegistrationEnabled) {
      throw new BadRequestException('Dynamic Client Registration is disabled');
    }

    const redirectUris = request.redirect_uris ?? [];
    if (redirectUris.length === 0) {
      throw new BadRequestException('redirect_uris must contain at least one URI');
    }
    if (redirectUris.length > this.config.maxRedirectUris) {
      throw new BadRequestException('too many redirect_uris');
    }

    const responseTypes = request.response_types ?? ['code'];
    if (responseTypes.some(value => value !== 'code')) {
      throw new BadRequestException('response_types supports only code');
    }

    const grantTypes = request.grant_types ?? ['authorization_code'];
    if (grantTypes.some(value => value !== 'authorization_code' && value !== 'refresh_token')) {
      throw new BadRequestException('unsupported grant_type');
    }

    if ((request.token_endpoint_auth_method ?? 'none') !== 'none') {
      throw new BadRequestException('token_endpoint_auth_method supports only none');
    }

    for (const redirectUri of redirectUris) {
      this.assertRedirectUriAllowed(redirectUri);
    }

    const scopes = request.scope ? this.parseScope(request.scope) : [...this.config.scopes];
    const clientId = `mcp_dyn_${randomUUID().replaceAll('-', '')}`;
    const client = await this.clientRegistry.register({
      clientId,
      clientName: request.client_name,
      resource,
      redirectUris,
      scopes,
      createdAt: new Date(),
    });

    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: client.scopes.join(' '),
    };
  }

  private parseScope(scope: string): McpScope[] {
    const scopes = scope.split(/\s+/).filter(Boolean);
    if (scopes.length === 0) {
      throw new BadRequestException('scope must not be empty');
    }
    for (const value of scopes) {
      if (!this.config.scopes.includes(value as McpScope)) {
        throw new BadRequestException(`unsupported scope: ${value}`);
      }
    }
    return scopes as McpScope[];
  }

  private assertRedirectUriAllowed(raw: string): void {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('redirect_uri must be a valid URL');
    }

    if (this.isLoopbackHttpRedirect(url)) {
      return;
    }

    if (url.protocol === 'https:' && this.config.allowedRedirectOrigins.includes(url.origin)) {
      return;
    }

    if (url.protocol === 'https:') {
      throw new BadRequestException(
        `redirect_uri origin is not allowlisted. Add to MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS: ${url.origin}`
      );
    }

    throw new BadRequestException('redirect_uri must be loopback http or allowlisted https origin');
  }

  private isLoopbackHttpRedirect(url: URL): boolean {
    return (
      url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)
    );
  }
}
