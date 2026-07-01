import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { McpScope } from '@owox/idp-protocol';

@Injectable()
export class McpConfigService {
  constructor(private readonly config: ConfigService) {}

  get publicBaseUrl(): string {
    return this.requireConfig('MCP_PUBLIC_BASE_URL');
  }

  get resource(): string {
    return this.config.get<string>('MCP_OAUTH_RESOURCE') ?? `${this.publicBaseUrl}/mcp`;
  }

  get protectedResourceMetadataUrl(): string {
    return `${this.publicBaseUrl}/.well-known/oauth-protected-resource`;
  }

  get authorizationServer(): string {
    return this.requireConfig('OWOX_AUTH_PUBLIC_BASE_URL');
  }

  get scopes(): McpScope[] {
    return ['mcp:read', 'mcp:write'];
  }

  get resourceDocumentationUrl(): string {
    return (
      this.config.get<string>('MCP_RESOURCE_DOCUMENTATION_URL') ?? 'https://docs.owox.com/docs/mcp'
    );
  }

  /**
   * Verification token for OpenAI Apps domain verification, served verbatim as
   * `text/plain` at `/.well-known/openai-apps-challenge`. Provided by OpenAI when
   * submitting the MCP app; configured via env so it can be rotated without a code
   * change. Returns `undefined` when unset, in which case the endpoint responds 404.
   */
  get openaiAppsChallengeToken(): string | undefined {
    return this.config.get<string>('MCP_OPENAI_APPS_CHALLENGE_TOKEN')?.trim() || undefined;
  }

  get serverName(): string {
    return this.config.get<string>('MCP_SERVER_NAME') ?? 'owox-mcp';
  }

  get serverVersion(): string {
    return this.config.get<string>('MCP_SERVER_VERSION') ?? '0.1.0';
  }

  private requireConfig(key: 'MCP_PUBLIC_BASE_URL' | 'OWOX_AUTH_PUBLIC_BASE_URL'): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new Error(`${key} is required for MCP`);
    }
    return value;
  }
}
