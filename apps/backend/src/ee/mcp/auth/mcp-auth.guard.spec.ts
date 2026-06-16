import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { McpTokenPayload } from '@owox/idp-protocol';
import { McpConfigService } from '../config/mcp.config';
import type { McpAuthPort } from './mcp-auth.port';
import { McpAuthGuard } from './mcp-auth.guard';

describe('McpAuthGuard', () => {
  const createConfig = () =>
    new McpConfigService({
      get: jest.fn((key: string) =>
        key === 'MCP_PUBLIC_BASE_URL' ? 'https://mcp.owox.com' : undefined
      ),
    } as unknown as ConfigService);

  const tokenPayload: McpTokenPayload = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['admin'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  const createContext = (authorization?: string) => {
    const request: Record<string, unknown> = {
      headers: authorization ? { authorization } : {},
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
    const guard = new McpAuthGuard(auth, createConfig());
    const { context, request } = createContext('Bearer access-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(auth.verifyToken).toHaveBeenCalledWith('access-token', ['mcp:read']);
    expect(request.mcpContext).toEqual(tokenPayload);
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
    const guard = new McpAuthGuard(auth, createConfig());
    const { context } = createContext(authorization);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
