import { ConfigService } from '@nestjs/config';
import { McpResourceResolverService } from './mcp-resource-resolver.service';

describe('McpResourceResolverService', () => {
  const createResolver = (overrides: Record<string, string | undefined> = {}) =>
    new McpResourceResolverService(
      new ConfigService({
        MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com',
        MCP_OAUTH_RESOURCE: 'https://mcp.owox.com/mcp',
        ...overrides,
      })
    );

  it('resolves the shared MCP resource', () => {
    expect(createResolver().resolveResource('https://mcp.owox.com/mcp')).toEqual({
      kind: 'shared',
      resource: 'https://mcp.owox.com/mcp',
      publicBaseUrl: 'https://mcp.owox.com',
      projectId: null,
    });
  });

  it('resolves a project MCP resource from the shared public base host', () => {
    expect(
      createResolver().resolveResource('https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/mcp')
    ).toEqual({
      kind: 'project',
      resource: 'https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/mcp',
      publicBaseUrl: 'https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com',
      projectId: '8c90f0b0f314bf5f5d6f69d24fd7ee3b',
    });
  });

  it('resolves a project MCP resource from a configured local HTTP base URL', () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';

    expect(
      createResolver({
        MCP_PUBLIC_BASE_URL: 'http://localhost:3000',
        MCP_OAUTH_RESOURCE: 'http://localhost:3000/mcp',
      }).resolveResource(`http://${projectId}.localhost:3000/mcp`)
    ).toEqual({
      kind: 'project',
      resource: `http://${projectId}.localhost:3000/mcp`,
      publicBaseUrl: `http://${projectId}.localhost:3000`,
      projectId,
    });
  });

  it.each([
    ['https://not-md5.mcp.owox.com/mcp'],
    ['https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/other'],
    ['https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.evil.com/mcp'],
    ['http://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/mcp'],
  ])('rejects invalid MCP resource %s', resource => {
    expect(() => createResolver().resolveResource(resource)).toThrow('invalid MCP resource');
  });

  it('resolves a request resource from normalized Express host and protocol', () => {
    const request = {
      protocol: 'https',
      host: '8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com',
      headers: { host: 'internal:3000' },
    };

    expect(createResolver().resolveRequest(request).resource).toBe(
      'https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/mcp'
    );
  });

  it('derives project host suffix from MCP_PUBLIC_BASE_URL', () => {
    expect(
      createResolver({
        MCP_PUBLIC_BASE_URL: 'https://mcp.dev.owox.com',
        MCP_OAUTH_RESOURCE: 'https://mcp.dev.owox.com/mcp',
      }).resolveResource('https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.dev.owox.com/mcp')
    ).toMatchObject({
      kind: 'project',
      projectId: '8c90f0b0f314bf5f5d6f69d24fd7ee3b',
    });
  });
});
