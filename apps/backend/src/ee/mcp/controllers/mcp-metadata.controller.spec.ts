import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpConfigService } from '../config/mcp.config';
import { McpMetadataController } from './mcp-metadata.controller';

describe('McpMetadataController', () => {
  it('throws when required public URLs are not configured', () => {
    const config = new McpConfigService({
      get: jest.fn(),
    } as unknown as ConfigService);
    const controller = new McpMetadataController(config);

    expect(() => controller.getProtectedResourceMetadata()).toThrow(
      'MCP_PUBLIC_BASE_URL is required for MCP'
    );
  });

  it('builds protected-resource metadata from environment config', () => {
    const values = new Map([
      ['MCP_PUBLIC_BASE_URL', 'https://mcp.dev.owox.com'],
      ['MCP_OAUTH_RESOURCE', 'https://mcp.dev.owox.com/mcp'],
      ['OWOX_AUTH_PUBLIC_BASE_URL', 'https://app.dev.owox.com'],
      ['MCP_RESOURCE_DOCUMENTATION_URL', 'https://docs.dev.owox.com/mcp'],
    ]);
    const config = new McpConfigService({
      get: jest.fn((key: string) => values.get(key)),
    } as unknown as ConfigService);
    const controller = new McpMetadataController(config);

    expect(controller.getProtectedResourceMetadata()).toEqual({
      resource: 'https://mcp.dev.owox.com/mcp',
      authorization_servers: ['https://app.dev.owox.com'],
      scopes_supported: ['mcp:read', 'mcp:write'],
      resource_documentation: 'https://docs.dev.owox.com/mcp',
    });
  });

  it('returns the configured OpenAI Apps challenge token verbatim', () => {
    const config = new McpConfigService({
      get: jest.fn((key: string) =>
        key === 'MCP_OPENAI_APPS_CHALLENGE_TOKEN' ? 'test-openai-apps-challenge-token' : undefined
      ),
    } as unknown as ConfigService);
    const controller = new McpMetadataController(config);

    expect(controller.getOpenaiAppsChallenge()).toBe('test-openai-apps-challenge-token');
  });

  it('responds with 404 when no OpenAI Apps challenge token is configured', () => {
    const config = new McpConfigService({
      get: jest.fn(() => undefined),
    } as unknown as ConfigService);
    const controller = new McpMetadataController(config);

    expect(() => controller.getOpenaiAppsChallenge()).toThrow(NotFoundException);
  });
});
