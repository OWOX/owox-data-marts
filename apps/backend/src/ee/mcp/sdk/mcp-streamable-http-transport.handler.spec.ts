import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpInstructionsService } from '../instructions/mcp-instructions.service';
import type { McpSdkServerFactory } from './mcp-sdk-server.factory';

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

describe('McpStreamableHttpTransportHandler', () => {
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

  const loadHandler = async () => {
    const module = await import('./mcp-streamable-http-transport.handler');
    return module.McpStreamableHttpTransportHandler;
  };

  const createResponse = () => ({
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  const createInstructionsService = () =>
    ({
      getInstructions: jest.fn().mockResolvedValue('OWOX instructions'),
    }) as unknown as jest.Mocked<McpInstructionsService>;

  it('creates stateless SDK transport for no-session tool requests', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const instructionsService = createInstructionsService();
    const McpStreamableHttpTransportHandler = await loadHandler();
    const handler = new McpStreamableHttpTransportHandler(factory, instructionsService);
    const request = { method: 'POST', headers: {} };
    const response = {};
    const body = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} };

    await handler.handleRequest(request as never, response as never, body, context);

    expect(factory.create).toHaveBeenCalledWith(context);
    expect(instructionsService.getInstructions).not.toHaveBeenCalled();
    expect(server.connect).toHaveBeenCalledWith(mockTransportInstances[0]);
    expect(mockHandleRequest).toHaveBeenCalledWith(request, response, body);
    expect(mockTransportInstances[0].sessionId).toBeUndefined();
    expect(mockTransportInstances[0].options.enableJsonResponse).toBe(true);
  });

  it('creates stateless SDK transport with JSON responses for initialize requests', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const instructionsService = createInstructionsService();
    const McpStreamableHttpTransportHandler = await loadHandler();
    const handler = new McpStreamableHttpTransportHandler(factory, instructionsService);
    const request = { method: 'POST', headers: {} };
    const response = {};
    const body = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };

    await handler.handleRequest(request as never, response as never, body, context);

    expect(instructionsService.getInstructions).toHaveBeenCalledWith('project-1');
    expect(factory.create).toHaveBeenCalledWith(context, 'OWOX instructions');
    expect(server.connect).toHaveBeenCalledWith(mockTransportInstances[0]);
    expect(mockHandleRequest).toHaveBeenCalledWith(request, response, body);
    expect(mockTransportInstances[0].sessionId).toBeUndefined();
    expect(mockTransportInstances[0].options.sessionIdGenerator).toBeUndefined();
    expect(mockTransportInstances[0].options.enableJsonResponse).toBe(true);
  });

  it('returns 405 for standalone GET SSE streams', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpTransportHandler = await loadHandler();
    const handler = new McpStreamableHttpTransportHandler(factory, createInstructionsService());
    const response = createResponse();

    await handler.handleRequest(
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

  it('allows tool requests with stale MCP session id to use a fresh stateless transport', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpTransportHandler = await loadHandler();
    const handler = new McpStreamableHttpTransportHandler(factory, createInstructionsService());
    const request = { method: 'POST', headers: { 'mcp-session-id': 'stale-session' } };
    const response = {};
    const body = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} };

    await handler.handleRequest(request as never, response as never, body, context);

    expect(factory.create).toHaveBeenCalledWith(context);
    expect(server.connect).toHaveBeenCalledWith(mockTransportInstances[0]);
    expect(mockHandleRequest).toHaveBeenCalledWith(request, response, body);
    expect(mockTransportInstances[0].sessionId).toBeUndefined();
    expect(mockTransportInstances[0].options.sessionIdGenerator).toBeUndefined();
  });

  it('creates a fresh transport for each request even with the same MCP session id', async () => {
    const server = { connect: jest.fn() };
    const factory = { create: jest.fn(() => server) } as unknown as McpSdkServerFactory;
    const McpStreamableHttpTransportHandler = await loadHandler();
    const handler = new McpStreamableHttpTransportHandler(factory, createInstructionsService());
    const request = { method: 'POST', headers: { 'mcp-session-id': 'stale-session' } };
    const response = {};
    const body = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} };

    await handler.handleRequest(request as never, response as never, body, context);
    await handler.handleRequest(request as never, response as never, body, context);

    expect(mockTransportInstances).toHaveLength(2);
    expect(server.connect).toHaveBeenCalledTimes(2);
    expect(mockHandleRequest).toHaveBeenCalledTimes(2);
  });
});
