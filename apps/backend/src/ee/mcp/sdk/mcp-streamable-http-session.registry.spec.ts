import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpConfigService } from '../config/mcp.config';
import type { McpSdkServerFactory } from './mcp-sdk-server.factory';

const createConfig = (stateless = false): McpConfigService =>
  ({ stateless }) as unknown as McpConfigService;

const mockHandleRequest = jest.fn();
const mockTransportInstances: MockStreamableHTTPServerTransport[] = [];

interface MockStreamableHTTPServerTransportOptions {
  sessionIdGenerator?: () => string;
  enableJsonResponse?: boolean;
}

class MockStreamableHTTPServerTransport {
  sessionId?: string;

  constructor(readonly options: MockStreamableHTTPServerTransportOptions) {
    this.sessionId = options.sessionIdGenerator?.();
    mockTransportInstances.push(this);
  }

  handleRequest = mockHandleRequest;
}

describe('McpStreamableHttpSessionRegistry', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['admin'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  beforeEach(() => {
    jest.resetModules();
    mockHandleRequest.mockReset();
    mockTransportInstances.length = 0;
    jest.restoreAllMocks();
    jest.doMock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
      StreamableHTTPServerTransport: MockStreamableHTTPServerTransport,
    }));
  });

  const loadRegistry = async () => {
    const module = await import('./mcp-streamable-http-session.registry');
    return module.McpStreamableHttpSessionRegistry;
  };

  const createResponse = () => ({
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  const initializeSession = async (
    registry: InstanceType<Awaited<ReturnType<typeof loadRegistry>>>
  ): Promise<string> => {
    await registry.handleRequest(
      { method: 'POST', headers: {} } as never,
      {} as never,
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      context
    );

    return String(mockTransportInstances[0].sessionId);
  };

  it('creates stateless SDK transport for no-session tool requests', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const request = { method: 'POST', headers: {} };
    const response = {};
    const body = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} };

    await registry.handleRequest(request as never, response as never, body, context);

    expect(factory.create).toHaveBeenCalledWith(context);
    expect(server.connect).toHaveBeenCalledWith(mockTransportInstances[0]);
    expect(mockHandleRequest).toHaveBeenCalledWith(request, response, body);
    expect(mockTransportInstances[0].sessionId).toBeUndefined();
    expect(mockTransportInstances[0].options.enableJsonResponse).toBe(true);
  });

  it('creates stateful SDK transport with JSON responses for initialize requests', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const request = { method: 'POST', headers: {} };
    const response = {};
    const body = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };

    await registry.handleRequest(request as never, response as never, body, context);

    expect(factory.create).toHaveBeenCalledWith(context);
    expect(server.connect).toHaveBeenCalledWith(mockTransportInstances[0]);
    expect(mockHandleRequest).toHaveBeenCalledWith(request, response, body);
    expect(mockTransportInstances[0].sessionId).toBeDefined();
    expect(mockTransportInstances[0].options.enableJsonResponse).toBe(true);
  });

  it('returns 405 for standalone GET SSE streams', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const response = createResponse();

    await registry.handleRequest(
      {
        method: 'GET',
        headers: {
          accept: 'application/json, text/event-stream',
          'mcp-session-id': 'session-1',
        },
      } as never,
      response as never,
      undefined,
      context
    );

    expect(response.setHeader).toHaveBeenCalledWith('Allow', 'POST, DELETE');
    expect(response.status).toHaveBeenCalledWith(405);
    expect(response.json).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Standalone MCP SSE stream is not supported',
      },
      id: null,
    });
    expect(factory.create).not.toHaveBeenCalled();
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('allows initialize request to recover from a stale MCP session id', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const request = { method: 'POST', headers: { 'mcp-session-id': 'stale-session' } };
    const response = {};
    const body = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };

    await registry.handleRequest(request as never, response as never, body, context);

    expect(factory.create).toHaveBeenCalledWith(context);
    expect(server.connect).toHaveBeenCalledWith(mockTransportInstances[0]);
    expect(mockHandleRequest).toHaveBeenCalledWith(request, response, body);
  });

  it('does not issue a session id for initialize requests in stateless mode', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig(true));
    const request = { method: 'POST', headers: {} };
    const response = {};
    const body = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };

    await registry.handleRequest(request as never, response as never, body, context);

    expect(factory.create).toHaveBeenCalledWith(context);
    expect(server.connect).toHaveBeenCalledWith(mockTransportInstances[0]);
    expect(mockHandleRequest).toHaveBeenCalledWith(request, response, body);
    expect(mockTransportInstances[0].sessionId).toBeUndefined();
    expect(mockTransportInstances[0].options.enableJsonResponse).toBe(true);
  });

  it('ignores a supplied session id in stateless mode instead of rejecting it', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig(true));
    const request = { method: 'POST', headers: { 'mcp-session-id': 'unknown-session' } };
    const response = {};
    const body = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} };

    await registry.handleRequest(request as never, response as never, body, context);

    expect(factory.create).toHaveBeenCalledWith(context);
    expect(mockHandleRequest).toHaveBeenCalledWith(request, response, body);
    expect(mockTransportInstances[0].sessionId).toBeUndefined();
  });

  it('rejects existing sessions when token project-member context changes', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const sessionId = await initializeSession(registry);

    await expect(
      registry.handleRequest(
        { headers: { 'mcp-session-id': sessionId } } as never,
        {} as never,
        {},
        { ...context, projectId: 'another-project' }
      )
    ).rejects.toMatchObject({
      status: 401,
      message: 'MCP session context mismatch',
    });
  });

  it('rejects existing sessions when OAuth client changes', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const sessionId = await initializeSession(registry);

    await expect(
      registry.handleRequest(
        { headers: { 'mcp-session-id': sessionId } } as never,
        {} as never,
        {},
        { ...context, clientId: 'mcp-client-2' }
      )
    ).rejects.toMatchObject({
      status: 401,
      message: 'MCP session context mismatch',
    });
  });

  it('rejects existing sessions when project roles change', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const sessionId = await initializeSession(registry);

    await expect(
      registry.handleRequest(
        { headers: { 'mcp-session-id': sessionId } } as never,
        {} as never,
        {},
        { ...context, roles: ['viewer'] }
      )
    ).rejects.toMatchObject({
      status: 401,
      message: 'MCP session context mismatch',
    });
  });

  it('rejects existing sessions when OAuth scopes change', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const sessionId = await initializeSession(registry);

    await expect(
      registry.handleRequest(
        { headers: { 'mcp-session-id': sessionId } } as never,
        {} as never,
        {},
        { ...context, scopes: ['mcp:read', 'mcp:write'] }
      )
    ).rejects.toMatchObject({
      status: 401,
      message: 'MCP session context mismatch',
    });
  });

  it('expires idle MCP sessions before routing follow-up requests', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpSessionRegistry = await loadRegistry();
    const registry = new McpStreamableHttpSessionRegistry(factory, createConfig());
    const sessionId = await initializeSession(registry);

    nowSpy.mockReturnValue(1_000 + 60 * 60 * 1000);

    await expect(
      registry.handleRequest(
        { method: 'POST', headers: { 'mcp-session-id': sessionId } } as never,
        {} as never,
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} },
        context
      )
    ).rejects.toMatchObject({
      status: 404,
      message: 'Unknown MCP session',
    });
    expect(mockHandleRequest).toHaveBeenCalledTimes(1);
  });
});
