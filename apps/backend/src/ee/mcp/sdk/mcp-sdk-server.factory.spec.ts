import { z } from 'zod';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import type { McpToolDefinition } from '../tools/mcp-tool.definition';
import { McpToolRegistry } from '../tools/mcp-tool.registry';

const mockRegisterTool = jest.fn();
const mockServer = {
  registerTool: mockRegisterTool,
};
const mockMcpServer = jest.fn(() => mockServer);

const passthroughInstrumentation = {
  wrap: (_name: string, cb: unknown) => cb,
} as never;

describe('McpSdkServerFactory', () => {
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
    mockRegisterTool.mockClear();
    mockMcpServer.mockClear();
    jest.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: mockMcpServer,
    }));
  });

  const loadFactory = async () => {
    const module = await import('./mcp-sdk-server.factory');
    return module.McpSdkServerFactory;
  };

  it('creates SDK server and registers active MCP tools', async () => {
    const handler = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const outputSchema = { items: z.array(z.string()) };
    const annotations = {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    };
    const tool = {
      name: 'list_data_marts',
      description: 'List data marts',
      zodSchema: { query: z.string().optional() },
      outputSchema,
      annotations,
      requiredScopes: ['mcp:read'],
      handler,
    } as McpToolDefinition<{ query?: string }> & {
      outputSchema: typeof outputSchema;
      annotations: typeof annotations;
    };
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([tool]),
      passthroughInstrumentation
    );

    expect(factory.create(context)).toBe(mockServer);

    expect(mockMcpServer).toHaveBeenCalledWith({
      name: 'owox-mcp',
      version: '0.1.0',
    });
    expect(mockRegisterTool).toHaveBeenCalledWith(
      'list_data_marts',
      {
        description: 'List data marts',
        inputSchema: { query: expect.any(Object) },
        outputSchema,
        annotations,
      },
      expect.any(Function)
    );

    const sdkHandler = mockRegisterTool.mock.calls[0][2];
    const signal = new AbortController().signal;
    await expect(sdkHandler({ query: 'orders' }, { signal })).resolves.toEqual({
      content: [{ type: 'text', text: 'ok' }],
    });
    // The SDK's per-request abort signal (client disconnect/cancel) must reach the tool handler.
    expect(handler).toHaveBeenCalledWith({ query: 'orders' }, context, signal);
  });

  it('forwards an undefined signal when the SDK provides no extra', async () => {
    const handler = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const tool = {
      name: 'list_data_marts',
      description: 'List data marts',
      zodSchema: { query: z.string().optional() },
      requiredScopes: ['mcp:read'],
      handler,
    } as McpToolDefinition<{ query?: string }>;
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([tool]),
      passthroughInstrumentation
    );

    factory.create(context);
    const sdkHandler = mockRegisterTool.mock.calls[0][2];

    await expect(sdkHandler({ query: 'orders' })).resolves.toEqual({
      content: [{ type: 'text', text: 'ok' }],
    });
    expect(handler).toHaveBeenCalledWith({ query: 'orders' }, context, undefined);
  });

  it('routes every tool callback through instrumentation.wrap (choke point)', async () => {
    const wrapped = jest.fn();
    const wrap = jest.fn((_name: string, _cb: unknown) => wrapped);
    const tool = {
      name: 'list_data_marts',
      description: 'List data marts',
      zodSchema: { query: z.string().optional() },
      requiredScopes: ['mcp:read'],
      handler: jest.fn(),
    } as McpToolDefinition<{ query?: string }>;
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([tool]),
      { wrap } as never
    );

    factory.create(context);

    // Deleting the instrumentation.wrap(...) call in the factory must fail here.
    expect(wrap).toHaveBeenCalledWith('list_data_marts', expect.any(Function));
    // The callback handed to the SDK is the one wrap() returned — instrumentation is not bypassed.
    expect(mockRegisterTool.mock.calls[0][2]).toBe(wrapped);
  });

  it('rejects tool calls when token context lacks required scope', async () => {
    const tool: McpToolDefinition = {
      name: 'write_tool',
      description: 'Write tool',
      zodSchema: {},
      requiredScopes: ['mcp:write'],
      handler: jest.fn(),
    };
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([tool]),
      passthroughInstrumentation
    );

    factory.create(context);
    const sdkHandler = mockRegisterTool.mock.calls[0][2];

    await expect(sdkHandler({})).rejects.toThrow('Missing MCP scope: mcp:write');
    expect(tool.handler).not.toHaveBeenCalled();
  });

  it('passes composed instructions to the MCP SDK server', async () => {
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([])
    );

    factory.create(context, 'OWOX instructions');

    expect(mockMcpServer).toHaveBeenCalledWith(
      { name: 'owox-mcp', version: '0.1.0' },
      { instructions: 'OWOX instructions' }
    );
  });
});
