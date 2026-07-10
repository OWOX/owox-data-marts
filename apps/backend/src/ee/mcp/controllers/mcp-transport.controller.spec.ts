import type { ClsContextService } from '../../../common/logger/cls-context.service';
import { DEFAULT_QUERY_DEADLINE_MS } from '../../../data-marts/use-cases/query-data-mart.service';
import type { McpAuthenticatedRequest } from '../auth/mcp-auth-context';
import { MCP_REQUEST_META_KEY } from '../observability/mcp-log-context';
import type { McpStreamableHttpTransportHandler } from '../sdk/mcp-streamable-http-transport.handler';
import { McpTransportController, MCP_REQUEST_SOCKET_TIMEOUT_MS } from './mcp-transport.controller';

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
    const cls = {
      runWithContext: jest.fn((_key: unknown, _context: unknown, callback: () => unknown) =>
        callback()
      ),
      update: jest.fn(),
      set: jest.fn(),
    } as unknown as ClsContextService;
    return {
      controller: new McpTransportController(transportHandler, cls),
      transportHandler,
      cls,
    };
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

  it('binds McpLogContext into CLS before handling', async () => {
    const cls = { runWithContext: jest.fn((_k, _c, cb) => cb()), update: jest.fn() };
    const controller = new McpTransportController(
      { handleRequest: jest.fn().mockResolvedValue(undefined) } as never,
      cls as never
    );
    const request = {
      method: 'POST',
      headers: {},
      mcpContext: { projectId: 'p1', userId: 'u1', clientId: 'c1' },
      setTimeout: jest.fn(),
    } as never;
    const response = { once: jest.fn(), statusCode: 200, getHeader: jest.fn() } as never;

    await controller.handleMcp(request, response, {});

    expect(cls.runWithContext).toHaveBeenCalledWith(
      'McpLogContext',
      expect.objectContaining({ projectId: 'p1', userId: 'u1', clientId: 'c1' }),
      expect.any(Function)
    );
  });

  it('threads params._meta into a dedicated CLS slot, not the auto-attached log context', async () => {
    const { controller, cls } = createController();
    const request = {
      mcpContext,
      method: 'POST',
      headers: {},
    } as unknown as McpAuthenticatedRequest;
    const response = { once: jest.fn() };
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'query_data_mart', _meta: { 'openai/session': 'conv-abc' } },
    };

    await controller.handleMcp(request, response as never, body);

    expect(cls.set).toHaveBeenCalledWith(MCP_REQUEST_META_KEY, { 'openai/session': 'conv-abc' });
    const context = (cls.runWithContext as jest.Mock).mock.calls[0][1];
    expect(context.meta).toBeUndefined();
  });

  it('correlates the response-finished log with requestId and userId (not via CLS)', async () => {
    const { controller } = createController();
    const debugSpy = jest
      .spyOn((controller as unknown as { logger: { debug: () => void } }).logger, 'debug')
      .mockImplementation(() => undefined);

    let finishCallback: (() => void) | undefined;
    const request = { mcpContext, setTimeout: jest.fn() } as unknown as McpAuthenticatedRequest;
    const response = {
      once: jest.fn((event: string, cb: () => void) => {
        if (event === 'finish') {
          finishCallback = cb;
        }
      }),
      statusCode: 200,
      getHeader: jest.fn(),
    } as never;

    await controller.handleMcp(request, response, { method: 'tools/call' });

    expect(finishCallback).toBeDefined();
    finishCallback!();

    expect(debugSpy).toHaveBeenCalledWith(
      'MCP response finished',
      expect.objectContaining({
        statusCode: 200,
        requestId: expect.any(String),
        userId: 'user-1',
        projectId: 'project-1',
        clientId: 'mcp-client-1',
      })
    );
  });
});
