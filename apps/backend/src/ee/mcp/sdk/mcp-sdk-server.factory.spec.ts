import { z } from 'zod';
import type { Role } from '@owox/idp-protocol';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { MCP_GUIDES, MCP_GUIDE_TOPICS } from '../instructions/mcp-guides';
import type { McpToolDefinition } from '../tools/mcp-tool.definition';
import { McpToolRegistry } from '../tools/mcp-tool.registry';

const mockRegisterTool = jest.fn();
const mockRegisterPrompt = jest.fn();
const mockRegisterResource = jest.fn();
const mockServer = {
  registerTool: mockRegisterTool,
  registerPrompt: mockRegisterPrompt,
  registerResource: mockRegisterResource,
};
const mockMcpServer = jest.fn(() => mockServer);

const passthroughInstrumentation = {
  wrap: (_name: string, cb: unknown) => cb,
  recordRead: jest.fn(),
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
    mockRegisterPrompt.mockClear();
    mockRegisterResource.mockClear();
    mockMcpServer.mockClear();
    jest.doMock('@modelcontextprotocol/server', () => ({
      McpServer: mockMcpServer,
    }));
  });

  afterEach(() => jest.restoreAllMocks());

  const loadFactory = async () => {
    const refreshModule = await import('./mcp-schema-refresh');
    jest.replaceProperty(refreshModule.McpSchemaRefresh, 'enabled', true);
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
        outputSchema: expect.objectContaining({ '~standard': expect.any(Object) }),
        annotations,
      },
      expect.any(Function)
    );

    const sdkHandler = mockRegisterTool.mock.calls[0][2];
    const signal = new AbortController().signal;
    await expect(sdkHandler({ query: 'orders' }, { mcpReq: { signal } })).resolves.toEqual({
      content: [{ type: 'text', text: 'ok' }],
    });
    // The SDK's per-request abort signal (client disconnect/cancel) must reach the tool handler.
    expect(handler).toHaveBeenCalledWith({ query: 'orders' }, context, signal);
  });

  it.each(['list_data_marts', 'query_data_mart', 'list_contexts'])(
    'shares the refresh cooldown across per-request servers and preserves calls when sending fails (%s)',
    async toolName => {
      const handler = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const tool = {
        name: toolName,
        description: 'List',
        zodSchema: {},
        requiredScopes: ['mcp:read'],
        handler,
      } as McpToolDefinition;
      const McpSdkServerFactory = await loadFactory();
      const factory = new McpSdkServerFactory(
        new McpConfigService({ get: jest.fn() } as never),
        new McpToolRegistry([tool]),
        passthroughInstrumentation
      );
      const notify = jest.fn().mockResolvedValue(undefined);
      factory.create(context);
      await mockRegisterTool.mock.calls[0][2]({}, { mcpReq: { notify } });
      factory.create(context);
      await mockRegisterTool.mock.calls[1][2]({}, { mcpReq: { notify } });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith({ method: 'notifications/tools/list_changed' });

      const failedNotify = jest.fn().mockRejectedValue(new Error('stream closed'));
      factory.create({ ...context, clientId: 'another' });
      await expect(
        mockRegisterTool.mock.calls[2][2]({}, { mcpReq: { notify: failedNotify } })
      ).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
      expect(handler).toHaveBeenCalledTimes(3);
    }
  );

  it('uses the subscription notifier for modern requests instead of emitting on the call stream', async () => {
    const tool = {
      name: 'get_data_mart_details_by_id',
      description: 'Details',
      zodSchema: {},
      requiredScopes: ['mcp:read'],
      handler: jest.fn().mockResolvedValue({ content: [] }),
    } as McpToolDefinition;
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([tool]),
      passthroughInstrumentation
    );
    const broadcast = jest.fn();
    const notify = jest.fn();
    factory.create(context, undefined, { era: 'modern', notifyToolsChanged: broadcast });
    await mockRegisterTool.mock.calls[0][2]({}, { mcpReq: { notify } });
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('forwards an undefined signal when the SDK provides no ctx', async () => {
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

  it.each([
    ['chatgpt', ['everywhere', 'chatgpt_only']],
    ['claude', ['everywhere', 'not_chatgpt']],
    [undefined, ['everywhere', 'not_chatgpt']],
  ] as const)('lists the tools for the %s client', async (integration, names) => {
    const tool = (name: string, chatgpt?: 'only' | 'hidden') =>
      ({
        name,
        description: name,
        zodSchema: {},
        requiredScopes: ['mcp:read'],
        chatgpt,
        handler: jest.fn(),
      }) as McpToolDefinition;
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([
        tool('everywhere'),
        tool('chatgpt_only', 'only'),
        tool('not_chatgpt', 'hidden'),
      ]),
      passthroughInstrumentation
    );

    factory.create({ ...context, integration });

    expect(mockRegisterTool.mock.calls.map(([name]) => name)).toEqual(names);
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
      new McpToolRegistry([]),
      passthroughInstrumentation
    );

    factory.create(context, 'OWOX instructions');

    expect(mockMcpServer).toHaveBeenCalledWith(
      { name: 'owox-mcp', version: '0.1.0' },
      { instructions: 'OWOX instructions' }
    );
  });

  it.each<{
    requiredRole: Role | undefined;
    roles: Role[];
    allowed: boolean;
  }>([
    { requiredRole: undefined, roles: ['viewer'], allowed: true },
    { requiredRole: 'viewer', roles: ['viewer'], allowed: true },
    { requiredRole: 'viewer', roles: ['editor'], allowed: true },
    { requiredRole: 'viewer', roles: ['admin'], allowed: true },
    { requiredRole: 'editor', roles: ['viewer'], allowed: false },
    { requiredRole: 'editor', roles: ['editor'], allowed: true },
    { requiredRole: 'editor', roles: ['admin'], allowed: true },
    { requiredRole: 'admin', roles: ['viewer'], allowed: false },
    { requiredRole: 'admin', roles: ['editor'], allowed: false },
    { requiredRole: 'admin', roles: ['admin'], allowed: true },
    { requiredRole: 'admin', roles: ['viewer', 'admin'], allowed: true },
    { requiredRole: 'admin', roles: [], allowed: false },
  ])(
    'checks requiredRole=$requiredRole against $roles (allowed=$allowed) before the handler or notifications',
    async ({ requiredRole, roles, allowed }) => {
      const tool: McpToolDefinition = {
        name: 'protected_tool',
        description: 'Protected tool',
        zodSchema: {},
        requiredScopes: ['mcp:read'],
        requiredRole,
        handler: jest.fn().mockResolvedValue({ content: [] }),
      };
      const McpSdkServerFactory = await loadFactory();
      const factory = new McpSdkServerFactory(
        new McpConfigService({ get: jest.fn() } as never),
        new McpToolRegistry([tool]),
        passthroughInstrumentation
      );
      factory.create({ ...context, roles });
      const notify = jest.fn();
      const call = mockRegisterTool.mock.calls[0][2]({}, { mcpReq: { notify } });

      if (allowed) {
        await expect(call).resolves.toEqual({ content: [] });
        expect(tool.handler).toHaveBeenCalledTimes(1);
      } else {
        await expect(call).rejects.toMatchObject({
          code: 'AUTHORIZATION_ERROR',
          message: `Access denied. Required project role: ${requiredRole}`,
        });
        expect(tool.handler).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
      }
    }
  );

  it('requires the OAuth scope even when the project role is sufficient', async () => {
    const tool: McpToolDefinition = {
      name: 'admin_write',
      description: 'Admin write',
      zodSchema: {},
      requiredScopes: ['mcp:write'],
      requiredRole: 'admin',
      handler: jest.fn(),
    };
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([tool]),
      passthroughInstrumentation
    );
    factory.create(context);
    await expect(mockRegisterTool.mock.calls[0][2]({})).rejects.toThrow(
      'Missing MCP scope: mcp:write'
    );
    expect(tool.handler).not.toHaveBeenCalled();
  });

  it('lists the prompts and resources for the claude.ai connector menu, and records each read', async () => {
    const recordRead = jest.fn();
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([]),
      { wrap: jest.fn(), recordRead } as never
    );

    factory.create({ ...context, integration: 'claude', scopes: ['mcp:read', 'mcp:write'] });

    expect(mockRegisterPrompt.mock.calls.map(([name]) => name)).toEqual([
      'explore_data',
      'create_report',
      'set_up_data_mart',
      'check_data_mart_runs',
    ]);
    expect(mockRegisterResource.mock.calls.map(([, uri]) => uri)).toEqual([
      ...MCP_GUIDE_TOPICS.map(topic => `owox://guides/${topic}`),
      'owox://docs/mcp',
    ]);

    const [, config, getPrompt] = mockRegisterPrompt.mock.calls[1];
    expect(config.title).toBe('Create a report');
    const ctx = { mcpReq: { _meta: { 'openai/session': 'conv-1' } } };
    const prompt = getPrompt(ctx);
    expect(prompt.messages).toHaveLength(1);
    expect(prompt.messages[0].role).toBe('user');
    expect(prompt.messages[0].content.text).toContain(MCP_GUIDES.reporting);
    expect(recordRead).toHaveBeenCalledWith('prompts/get', 'create_report', ctx);

    const [, uri, metadata, readResource] = mockRegisterResource.mock.calls[0];
    expect(metadata).toEqual({
      title: 'Reporting guide',
      mimeType: 'text/markdown',
    });
    expect(readResource(new URL(uri), ctx)).toEqual({
      contents: [{ uri, mimeType: 'text/markdown', text: MCP_GUIDES.reporting }],
    });
    expect(recordRead).toHaveBeenCalledWith('resources/read', uri, ctx);

    const [, , , readDocs] = mockRegisterResource.mock.calls[MCP_GUIDE_TOPICS.length];
    const docs = readDocs(new URL('owox://docs/mcp'), ctx);
    expect(docs.contents[0].text).toContain(
      'https://docs.owox.com/docs/getting-started/setup-guide/mcp/'
    );
  });

  it.each([
    ['a read-only token', ['admin'], ['mcp:read'], ['explore_data', 'check_data_mart_runs']],
    [
      'a viewer',
      ['viewer'],
      ['mcp:read', 'mcp:write'],
      ['explore_data', 'create_report', 'check_data_mart_runs'],
    ],
  ] as const)('lists only the prompts that %s can do', async (_who, roles, scopes, names) => {
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([]),
      passthroughInstrumentation
    );

    factory.create({ ...context, roles: [...roles], scopes: [...scopes] });

    expect(mockRegisterPrompt.mock.calls.map(([name]) => name)).toEqual(names);
  });

  it('gives ChatGPT no prompts or resources, because it has no menu for them', async () => {
    const McpSdkServerFactory = await loadFactory();
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([]),
      passthroughInstrumentation
    );

    factory.create({ ...context, integration: 'chatgpt' });

    expect(mockRegisterPrompt).not.toHaveBeenCalled();
    expect(mockRegisterResource).not.toHaveBeenCalled();
  });
});
