import type { McpAuthenticatedRequest } from '../auth/mcp-auth-context';
import type { McpStreamableHttpTransportHandler } from '../sdk/mcp-streamable-http-transport.handler';
import { McpTransportController, MCP_REQUEST_SOCKET_TIMEOUT_MS } from './mcp-transport.controller';
import { DEFAULT_QUERY_DEADLINE_MS } from '../../../data-marts/use-cases/query-data-mart.service';

const mcpContext = {
  clientId: 'mcp-client-1',
  userId: 'user-1',
  projectId: 'project-1',
  roles: ['admin'],
  resource: 'https://mcp.owox.com/mcp',
  scopes: ['mcp:read'],
  authFlow: 'mcp',
};

describe('McpTransportController', () => {
  const createController = () => {
    const transportHandler = {
      handleRequest: jest.fn().mockResolvedValue(undefined),
    } as unknown as McpStreamableHttpTransportHandler;
    return { controller: new McpTransportController(transportHandler), transportHandler };
  };

  it('delegates authenticated HTTP requests to SDK transport handler', async () => {
    const { controller, transportHandler } = createController();
    const request = { mcpContext } as McpAuthenticatedRequest;
    const response = {};
    const body = { method: 'tools/list' };

    await controller.handleMcp(request, response as never, body);

    expect(transportHandler.handleRequest).toHaveBeenCalledWith(
      request,
      response,
      body,
      request.mcpContext
    );
  });

  it('raises the per-request socket timeout so a computing MCP call is not idle-reset', async () => {
    const { controller } = createController();
    const setTimeout = jest.fn();
    const request = { mcpContext, setTimeout } as unknown as McpAuthenticatedRequest;

    await controller.handleMcp(request, {} as never, { method: 'tools/call' });

    expect(setTimeout).toHaveBeenCalledWith(MCP_REQUEST_SOCKET_TIMEOUT_MS);
  });

  it('does not throw when the request has no setTimeout (guard)', async () => {
    const { controller, transportHandler } = createController();
    const request = { mcpContext } as McpAuthenticatedRequest;

    await expect(controller.handleMcp(request, {} as never, {})).resolves.toBeUndefined();
    expect(transportHandler.handleRequest).toHaveBeenCalled();
  });

  it('keeps the socket timeout above the query deadline so the app timeout wins', () => {
    expect(MCP_REQUEST_SOCKET_TIMEOUT_MS).toBeGreaterThan(DEFAULT_QUERY_DEADLINE_MS);
  });
});
