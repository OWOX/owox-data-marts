import { ConfigService } from '@nestjs/config';
import type { NextFunction, Response } from 'express';
import type { McpTokenPayload } from '@owox/idp-protocol';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import { McpConfigService } from '../config/mcp.config';
import type { McpAuthPort } from './mcp-auth.port';
import {
  McpAuthMiddleware,
  toMcpAuthContext,
  type McpAuthenticatedRequest,
} from './mcp-auth.middleware';

describe('McpAuthMiddleware', () => {
  const tokenPayload: McpTokenPayload = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['admin'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  const createMiddleware = (auth: McpAuthPort) => {
    const configService = new ConfigService({ MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com' });
    return new McpAuthMiddleware(
      auth,
      new McpResourceResolverService(configService),
      new McpConfigService(configService)
    );
  };

  const createRequest = (
    authorization?: string,
    headers: Record<string, string> = { host: 'mcp.owox.com' }
  ): McpAuthenticatedRequest =>
    ({
      method: 'POST',
      url: '/mcp',
      protocol: 'https',
      headers: authorization ? { ...headers, authorization } : headers,
    }) as unknown as McpAuthenticatedRequest;

  const createResponse = (): jest.Mocked<Pick<Response, 'setHeader' | 'status' | 'json'>> =>
    ({
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }) as never;

  it('attaches verified auth info to the request and calls next()', async () => {
    const auth = {
      verifyToken: jest.fn().mockResolvedValue(tokenPayload),
    } as unknown as McpAuthPort;
    const middleware = createMiddleware(auth);
    const request = createRequest('Bearer access-token');
    const response = createResponse();
    const next = jest.fn();

    await middleware.handle(request, response as unknown as Response, next as NextFunction);

    expect(auth.verifyToken).toHaveBeenCalledWith('access-token', 'https://mcp.owox.com/mcp', [
      'mcp:read',
    ]);
    expect(request.auth).toEqual({
      token: 'access-token',
      clientId: 'mcp-client-1',
      scopes: ['mcp:read'],
      extra: { mcpContext: tokenPayload },
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
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
    const middleware = createMiddleware(auth);
    const request = createRequest('Bearer access-token', { host: `${projectId}.mcp.owox.com` });
    const next = jest.fn();

    await middleware.handle(request, createResponse() as unknown as Response, next as NextFunction);

    expect(auth.verifyToken).toHaveBeenCalledWith(
      'access-token',
      `https://${projectId}.mcp.owox.com/mcp`,
      ['mcp:read']
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects a project host token for a different project id with a 401 challenge', async () => {
    const resourceProjectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    const tokenProjectId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const auth = {
      verifyToken: jest.fn().mockResolvedValue({
        ...tokenPayload,
        projectId: tokenProjectId,
        resource: `https://${resourceProjectId}.mcp.owox.com/mcp`,
      }),
    } as unknown as McpAuthPort;
    const middleware = createMiddleware(auth);
    const request = createRequest('Bearer access-token', {
      host: `${resourceProjectId}.mcp.owox.com`,
    });
    const response = createResponse();
    const next = jest.fn();

    await middleware.handle(request, response as unknown as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 401,
      message: 'Invalid MCP project context',
      error: 'Unauthorized',
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      `Bearer resource_metadata="https://${resourceProjectId}.mcp.owox.com/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"`
    );
  });

  it('rejects invalid project hosts as unauthorized without calling verifyToken', async () => {
    const auth = {
      verifyToken: jest.fn().mockResolvedValue(tokenPayload),
    } as unknown as McpAuthPort;
    const middleware = createMiddleware(auth);
    const request = createRequest('Bearer access-token', { host: 'not-md5.mcp.owox.com' });
    const response = createResponse();

    await middleware.handle(request, response as unknown as Response, jest.fn() as NextFunction);

    expect(auth.verifyToken).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    // Falls back to the shared challenge when the host doesn't resolve to any known resource.
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://mcp.owox.com/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"'
    );
  });

  it.each([
    ['missing bearer token', undefined, null, 'Missing MCP bearer token'],
    ['invalid token', 'Bearer invalid-token', null, 'Invalid MCP bearer token'],
    [
      'wrong resource',
      'Bearer wrong-resource',
      { ...tokenPayload, resource: 'https://app.owox.com/api' },
      'Invalid MCP resource',
    ],
    [
      'missing project id',
      'Bearer missing-project',
      { ...tokenPayload, projectId: '' },
      'Missing MCP project context',
    ],
    [
      'empty roles',
      'Bearer empty-roles',
      { ...tokenPayload, roles: [] },
      'Missing MCP project roles',
    ],
    [
      'missing required scope',
      'Bearer missing-scope',
      { ...tokenPayload, scopes: [] },
      'Missing MCP scope',
    ],
  ])(
    'rejects %s with a 401',
    async (_caseName, authorization, verifiedPayload, expectedMessage) => {
      const auth = {
        verifyToken: jest.fn().mockResolvedValue(verifiedPayload),
      } as unknown as McpAuthPort;
      const middleware = createMiddleware(auth);
      const request = createRequest(authorization);
      const response = createResponse();
      const next = jest.fn();

      await middleware.handle(request, response as unknown as Response, next as NextFunction);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: expectedMessage,
          error: 'Unauthorized',
        })
      );
    }
  );

  it('logs an unauthenticated GET /mcp probe at a lower level than a real rejection (no distinguishable side effect asserted here beyond the 401 itself)', async () => {
    const auth = { verifyToken: jest.fn() } as unknown as McpAuthPort;
    const middleware = createMiddleware(auth);
    const request = { ...createRequest(), method: 'GET', url: '/mcp' } as McpAuthenticatedRequest;
    const response = createResponse();

    await middleware.handle(request, response as unknown as Response, jest.fn() as NextFunction);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });
});

describe('toMcpAuthContext', () => {
  const payload: McpTokenPayload = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['admin'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  it('recovers the McpTokenPayload stashed by McpAuthMiddleware', () => {
    expect(
      toMcpAuthContext({
        token: 'access-token',
        clientId: payload.clientId,
        scopes: payload.scopes,
        extra: { mcpContext: payload },
      })
    ).toEqual(payload);
  });

  it('throws when authInfo carries no verified context', () => {
    expect(() => toMcpAuthContext(undefined)).toThrow(
      'MCP request reached the server factory without a verified auth context'
    );
  });
});
