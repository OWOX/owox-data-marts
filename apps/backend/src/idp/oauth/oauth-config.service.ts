import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { McpScope } from '@owox/idp-protocol';

@Injectable()
export class OAuthConfigService {
  constructor(private readonly config: ConfigService) {}

  get issuer(): string {
    return this.requireConfig('OWOX_AUTH_PUBLIC_BASE_URL');
  }

  get mcpPublicBaseUrl(): string {
    return this.requireConfig('MCP_PUBLIC_BASE_URL');
  }

  get authorizationEndpoint(): string {
    return `${this.issuer}/oauth/authorize`;
  }

  get tokenEndpoint(): string {
    return `${this.issuer}/oauth/token`;
  }

  get registrationEndpoint(): string {
    return `${this.issuer}/oauth/register`;
  }

  get jwksEndpoint(): string {
    return `${this.issuer}/oauth/jwks`;
  }

  get resource(): string {
    return this.config.get<string>('MCP_OAUTH_RESOURCE') ?? `${this.mcpPublicBaseUrl}/mcp`;
  }

  get scopes(): McpScope[] {
    return ['mcp:read', 'mcp:write'];
  }

  get isDynamicClientRegistrationEnabled(): boolean {
    return this.config.get<string>('MCP_DYNAMIC_CLIENT_REGISTRATION_ENABLED') !== 'false';
  }

  get allowedRedirectOrigins(): string[] {
    const value = this.config.get<string>('MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS') ?? '';
    return value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(value => this.toHttpsOrigin(value))
      .filter((value): value is string => Boolean(value));
  }

  get maxRedirectUris(): number {
    return Number(this.config.get<string>('MCP_DYNAMIC_CLIENT_MAX_REDIRECT_URIS') ?? 10);
  }

  private toHttpsOrigin(value: string): string | null {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.origin : null;
    } catch {
      return null;
    }
  }

  private requireConfig(key: 'OWOX_AUTH_PUBLIC_BASE_URL' | 'MCP_PUBLIC_BASE_URL'): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new Error(`${key} is required for MCP OAuth`);
    }
    return value;
  }
}
