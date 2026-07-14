import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import { McpConfigService } from '../config/mcp.config';
import { McpMetadataController } from './mcp-metadata.controller';

describe('McpMetadataController', () => {
  const createController = (values: Map<string, string | undefined>) => {
    const configService = new ConfigService(Object.fromEntries(values));
    const config = new McpConfigService(configService);
    const resolver = new McpResourceResolverService(configService);
    return new McpMetadataController(config, resolver);
  };

  it('throws when required public URLs are not configured', () => {
    const configService = new ConfigService();
    const controller = new McpMetadataController(
      new McpConfigService(configService),
      new McpResourceResolverService(configService)
    );

    expect(() =>
      controller.getProtectedResourceMetadata({
        protocol: 'https',
        headers: { host: 'mcp.owox.com' },
      } as never)
    ).toThrow('MCP_PUBLIC_BASE_URL is required for MCP');
  });

  it('builds protected-resource metadata from environment config', () => {
    const values = new Map([
      ['MCP_PUBLIC_BASE_URL', 'https://mcp.dev.owox.com'],
      ['MCP_OAUTH_RESOURCE', 'https://mcp.dev.owox.com/mcp'],
      ['OWOX_AUTH_PUBLIC_BASE_URL', 'https://app.dev.owox.com'],
      ['MCP_RESOURCE_DOCUMENTATION_URL', 'https://docs.dev.owox.com/mcp'],
    ]);
    const controller = createController(values);

    expect(
      controller.getProtectedResourceMetadata({
        protocol: 'https',
        headers: { host: 'mcp.dev.owox.com' },
      } as never)
    ).toEqual({
      resource: 'https://mcp.dev.owox.com/mcp',
      authorization_servers: ['https://app.dev.owox.com'],
      scopes_supported: ['mcp:read', 'mcp:write'],
      resource_documentation: 'https://docs.dev.owox.com/mcp',
    });
  });

  it('builds protected-resource metadata for project host requests', () => {
    const values = new Map([
      ['MCP_PUBLIC_BASE_URL', 'https://mcp.owox.com'],
      ['MCP_OAUTH_RESOURCE', 'https://mcp.owox.com/mcp'],
      ['OWOX_AUTH_PUBLIC_BASE_URL', 'https://app.owox.com'],
      ['MCP_RESOURCE_DOCUMENTATION_URL', 'https://docs.owox.com/mcp'],
    ]);
    const controller = createController(values);

    expect(
      controller.getProtectedResourceMetadata({
        protocol: 'https',
        host: '8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com',
        headers: { host: '8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com' },
      } as never)
    ).toEqual({
      resource: 'https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/mcp',
      authorization_servers: ['https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com'],
      scopes_supported: ['mcp:read', 'mcp:write'],
      resource_documentation: 'https://docs.owox.com/mcp',
    });
  });

  it('rejects invalid project host metadata requests with bad request', () => {
    const values = new Map([
      ['MCP_PUBLIC_BASE_URL', 'https://mcp.owox.com'],
      ['MCP_OAUTH_RESOURCE', 'https://mcp.owox.com/mcp'],
      ['OWOX_AUTH_PUBLIC_BASE_URL', 'https://app.owox.com'],
    ]);
    const controller = createController(values);

    expect(() =>
      controller.getProtectedResourceMetadata({
        protocol: 'https',
        headers: { host: 'not-md5.mcp.owox.com' },
      } as never)
    ).toThrow(BadRequestException);
  });

  it('returns the configured OpenAI Apps challenge token verbatim', () => {
    const config = new McpConfigService({
      get: jest.fn((key: string) =>
        key === 'MCP_OPENAI_APPS_CHALLENGE_TOKEN' ? 'test-openai-apps-challenge-token' : undefined
      ),
    } as unknown as ConfigService);
    const controller = new McpMetadataController(config, {} as McpResourceResolverService);

    expect(controller.getOpenaiAppsChallenge()).toBe('test-openai-apps-challenge-token');
  });

  it('responds with 404 when no OpenAI Apps challenge token is configured', () => {
    const config = new McpConfigService({
      get: jest.fn(() => undefined),
    } as unknown as ConfigService);
    const controller = new McpMetadataController(config, {} as McpResourceResolverService);

    expect(() => controller.getOpenaiAppsChallenge()).toThrow(NotFoundException);
  });
});
