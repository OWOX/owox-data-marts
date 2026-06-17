import type { McpAuthenticatedRequest } from '../auth/mcp-auth-context';
import type { McpStreamableHttpSessionRegistry } from '../sdk/mcp-streamable-http-session.registry';
import { McpTransportController } from './mcp-transport.controller';

describe('McpTransportController', () => {
  it('delegates authenticated HTTP requests to SDK transport registry', async () => {
    const registry = {
      handleRequest: jest.fn().mockResolvedValue(undefined),
    } as unknown as McpStreamableHttpSessionRegistry;
    const controller = new McpTransportController(registry);
    const request = {
      mcpContext: {
        clientId: 'mcp-client-1',
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['admin'],
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
        authFlow: 'mcp',
      },
    } as McpAuthenticatedRequest;
    const response = {};
    const body = { method: 'tools/list' };

    await controller.handleMcp(request, response as never, body);

    expect(registry.handleRequest).toHaveBeenCalledWith(
      request,
      response,
      body,
      request.mcpContext
    );
  });
});
