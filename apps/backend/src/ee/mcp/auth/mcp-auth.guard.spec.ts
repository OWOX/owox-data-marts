import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { McpTokenPayload } from '@owox/idp-protocol';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import type { McpAuthPort } from './mcp-auth.port';
import { McpAuthGuard } from './mcp-auth.guard';

describe('McpAuthGuard', () => {
  const createResolver = () =>
    new McpResourceResolverService(
      new ConfigService({
        MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com',
      })
    );

  const tokenPayload: McpTokenPayload = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['admin'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  const createContext = (
    authorization?: string,
    headers: Record<string, string> = { host: 'mcp.owox.com' }
  ) => {
    const request: Record<string, unknown> = {
      protocol: 'https',
      headers: authorization ? { ...headers, authorization } : headers,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    return { context, request };
  };

  it('attaches verified project-member context to request', async () => {
    const auth = {
      verifyToken: jest.fn().mockResolvedValue(tokenPayload),
    } as unknown as McpAuthPort;
    const guard = new McpAuthGuard(auth, createResolver());
    const { context, request } = createContext('Bearer access-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(auth.verifyToken).toHaveBeenCalledWith('access-token', 'https://mcp.owox.com/mcp', [
      'mcp:read',
    ]);
    expect(request.mcpContext).toEqual(tokenPayload);
  });

  it('verifies project host tokens against the project-specific resource', async () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    const projectPayload: McpTokenPayload = {
      ...tokenPayload,
      projectId,
      resource: `https://${projectId}.mcp.owox.com/mcp`,
    };
    const auth = {
      verifyToken: jest.fn().mockResolvedValue(projectPayload),
    } as unknown as McpAuthPort;
    const guard = new McpAuthGuard(auth, createResolver());
    const { context, request } = createContext('Bearer access-token', {
      host: `${projectId}.mcp.owox.com`,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(auth.verifyToken).toHaveBeenCalledWith(
      'access-token',
      `https://${projectId}.mcp.owox.com/mcp`,
      ['mcp:read']
    );
    expect(request.mcpContext).toEqual(projectPayload);
  });

  it('rejects a project host token for a different project id', async () => {
    const resourceProjectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    const tokenProjectId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const auth = {
      verifyToken: jest.fn().mockResolvedValue({
        ...tokenPayload,
        projectId: tokenProjectId,
        resource: `https://${resourceProjectId}.mcp.owox.com/mcp`,
      }),
    } as unknown as McpAuthPort;
    const guard = new McpAuthGuard(auth, createResolver());
    const { context } = createContext('Bearer access-token', {
      host: `${resourceProjectId}.mcp.owox.com`,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid project hosts as unauthorized without token verification', async () => {
    const auth = {
      verifyToken: jest.fn().mockResolvedValue(tokenPayload),
    } as unknown as McpAuthPort;
    const guard = new McpAuthGuard(auth, createResolver());
    const { context } = createContext('Bearer access-token', {
      host: 'not-md5.mcp.owox.com',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });

  it.each([
    ['missing bearer token', undefined, null],
    ['invalid token', 'Bearer invalid-token', null],
    [
      'wrong resource',
      'Bearer wrong-resource',
      { ...tokenPayload, resource: 'https://app.owox.com/api' },
    ],
    ['missing project id', 'Bearer missing-project', { ...tokenPayload, projectId: '' }],
    ['empty roles', 'Bearer empty-roles', { ...tokenPayload, roles: [] }],
    ['missing required scope', 'Bearer missing-scope', { ...tokenPayload, scopes: [] }],
  ])('rejects %s', async (_caseName, authorization, verifiedPayload) => {
    const auth = {
      verifyToken: jest.fn().mockResolvedValue(verifiedPayload),
    } as unknown as McpAuthPort;
    const guard = new McpAuthGuard(auth, createResolver());
    const { context } = createContext(authorization);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
