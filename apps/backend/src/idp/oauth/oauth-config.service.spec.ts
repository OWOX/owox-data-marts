import { ConfigService } from '@nestjs/config';
import { OAuthConfigService } from './oauth-config.service';

describe('OAuthConfigService', () => {
  it('requires OWOX_AUTH_PUBLIC_BASE_URL for OAuth issuer metadata', () => {
    const config = new OAuthConfigService({
      get: jest.fn(),
    } as unknown as ConfigService);

    expect(() => config.issuer).toThrow('OWOX_AUTH_PUBLIC_BASE_URL is required for MCP OAuth');
  });

  it('requires MCP_PUBLIC_BASE_URL when MCP OAuth resource is not explicitly configured', () => {
    const config = new OAuthConfigService({
      get: jest.fn(),
    } as unknown as ConfigService);

    expect(() => config.resource).toThrow('MCP_PUBLIC_BASE_URL is required for MCP OAuth');
  });

  it('uses explicit MCP OAuth config values from environment', () => {
    const values = new Map([
      ['OWOX_AUTH_PUBLIC_BASE_URL', 'https://app.dev.owox.com'],
      ['MCP_PUBLIC_BASE_URL', 'https://mcp.dev.owox.com'],
      ['MCP_OAUTH_RESOURCE', 'https://custom.example/mcp'],
    ]);
    const config = new OAuthConfigService({
      get: jest.fn((key: string) => values.get(key)),
    } as unknown as ConfigService);

    expect(config.issuer).toBe('https://app.dev.owox.com');
    expect(config.mcpPublicBaseUrl).toBe('https://mcp.dev.owox.com');
    expect(config.resource).toBe('https://custom.example/mcp');
  });
});
