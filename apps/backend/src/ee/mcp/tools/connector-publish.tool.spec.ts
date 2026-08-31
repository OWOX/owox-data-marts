import type { McpConnectorAuthoringFacade } from '../../../data-marts/facades/mcp-connector-authoring.facade';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ConnectorPublishTool } from './connector-publish.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

const context: McpAuthContext = {
  clientId: 'c1',
  userId: 'user-1',
  projectId: 'project-1',
  roles: ['editor'],
  resource: 'https://mcp.owox.com/mcp',
  scopes: ['mcp:read', 'mcp:write'],
  authFlow: 'mcp',
};
const origin = { getPublicOrigin: () => 'https://app.owox.com' } as PublicOriginService;

it('publishes a connector using token project-member context (create-and-publish shape)', async () => {
  const response = {
    connectorId: 'def_1',
    name: 'Acme',
    version: 1,
    status: 'published',
    warnings: [],
  };
  const facade = {
    publishConnector: jest.fn().mockResolvedValue(response),
  } as unknown as jest.Mocked<McpConnectorAuthoringFacade>;
  const tool = new ConnectorPublishTool(facade, origin);

  const input = {
    name: 'Acme',
    title: 'Acme API',
    manifest: { source: {} },
  };

  const structuredContent = {
    connector_id: response.connectorId,
    name: response.name,
    version: response.version,
    status: response.status,
    warnings: [],
    url: 'https://app.owox.com/ui/project-1/connectors/builder/def_1',
  };
  await expect(tool.handler(input, context)).resolves.toEqual({
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  });
  expect(facade.publishConnector).toHaveBeenCalledWith({
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
    connectorId: undefined,
    name: 'Acme',
    title: 'Acme API',
    manifest: { source: {} },
  });
});

it('publishes an existing draft using token project-member context (connector_id shape)', async () => {
  const response = {
    connectorId: 'def_9',
    name: 'Existing',
    version: 2,
    status: 'published',
    warnings: [],
  };
  const facade = {
    publishConnector: jest.fn().mockResolvedValue(response),
  } as unknown as jest.Mocked<McpConnectorAuthoringFacade>;
  const tool = new ConnectorPublishTool(facade, origin);

  const structuredContent = {
    connector_id: response.connectorId,
    name: response.name,
    version: response.version,
    status: response.status,
    warnings: [],
    url: 'https://app.owox.com/ui/project-1/connectors/builder/def_9',
  };
  await expect(tool.handler({ connector_id: 'def_9' }, context)).resolves.toEqual({
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  });
  expect(facade.publishConnector).toHaveBeenCalledWith({
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
    connectorId: 'def_9',
    name: undefined,
    title: undefined,
    manifest: undefined,
  });
});

it('returns an absolute builder link the assistant can hand to the user', async () => {
  const facade = {
    publishConnector: jest.fn().mockResolvedValue({
      connectorId: 'c1',
      name: 'Acme',
      version: 1,
      status: 'published',
      warnings: [],
    }),
  } as unknown as jest.Mocked<McpConnectorAuthoringFacade>;
  const tool = new ConnectorPublishTool(facade, {
    getPublicOrigin: () => 'https://app.example.com',
  } as PublicOriginService);

  const res = await tool.handler({ connector_id: 'c1' }, { ...context, projectId: 'p1' });
  expect((res.structuredContent as { url: string }).url).toBe(
    'https://app.example.com/ui/p1/connectors/builder/c1'
  );
});

/**
 * The publish-time coverage warnings are the only thing standing between an author's mistake
 * and a credential stored in plain text, and the assistant driving this tool is the author's
 * only view of them: it never sees the backend log. Relayed on the result, or lost.
 */
it('relays the publish coverage warnings so the assistant can show them to the author', async () => {
  const warnings = [
    'Connector \'Acme\' v1: "authentication" references undeclared parameter(s) Token.',
  ];
  const facade = {
    publishConnector: jest.fn().mockResolvedValue({
      connectorId: 'c1',
      name: 'Acme',
      version: 1,
      status: 'published',
      warnings,
    }),
  } as unknown as jest.Mocked<McpConnectorAuthoringFacade>;
  const tool = new ConnectorPublishTool(facade, origin);

  const res = await tool.handler({ connector_id: 'c1' }, context);
  expect((res.structuredContent as { warnings: string[] }).warnings).toEqual(warnings);
  // Also in the text block: a client that reads only `content` must still see them.
  expect(res.content[0].text).toContain('undeclared parameter(s) Token');
});

it('rejects input satisfying neither valid shape', () => {
  const tool = new ConnectorPublishTool({} as McpConnectorAuthoringFacade, origin);
  expect(() => tool.parseInput({})).toThrow();
});

it('rejects input mixing connector_id with name (neither shape fully satisfied)', () => {
  const tool = new ConnectorPublishTool({} as McpConnectorAuthoringFacade, origin);
  expect(() => tool.parseInput({ connector_id: 'x', name: 'Y' })).toThrow();
});

it('accepts connector_id together with a manifest (update)', () => {
  const tool = new ConnectorPublishTool({} as McpConnectorAuthoringFacade, origin);
  expect(() =>
    tool.parseInput({ connector_id: 'def-1', manifest: { version: '1.0' } })
  ).not.toThrow();
});

it('still rejects a mix of connector_id and name', () => {
  const tool = new ConnectorPublishTool({} as McpConnectorAuthoringFacade, origin);
  expect(() =>
    tool.parseInput({ connector_id: 'def-1', name: 'X', title: 'X', manifest: {} })
  ).toThrow();
});

it('still rejects name without a manifest', () => {
  const tool = new ConnectorPublishTool({} as McpConnectorAuthoringFacade, origin);
  expect(() => tool.parseInput({ name: 'X', title: 'X' })).toThrow();
});

/**
 * `name` and `title` are stored in `varchar` columns -- TypeORM's default length, 255 -- and
 * this schema is one of the two ways in. CreateCustomConnectorRequestApiDto bounds the HTTP
 * side with `@MaxLength(255)`; unbounded here, the same value written over MCP would be
 * ER_DATA_TOO_LONG on MySQL in strict mode, or silently truncated otherwise. The local suite
 * cannot see it either way, because SQLite ignores declared column lengths.
 *
 * The name's regex does not help: `[A-Za-z][A-Za-z0-9_]*` has no upper bound at all.
 */
describe('name and title are bounded by the columns that store them', () => {
  const MAX_VARCHAR_LENGTH = 255;
  const tool = () => new ConnectorPublishTool({} as McpConnectorAuthoringFacade, origin);

  it('rejects a name longer than the column', () => {
    expect(() =>
      tool().parseInput({
        name: 'A'.repeat(MAX_VARCHAR_LENGTH + 1),
        title: 'Acme API',
        manifest: {},
      })
    ).toThrow();
  });

  it('rejects a title longer than the column', () => {
    expect(() =>
      tool().parseInput({
        name: 'Acme',
        title: 'A'.repeat(MAX_VARCHAR_LENGTH + 1),
        manifest: {},
      })
    ).toThrow();
  });

  it('accepts a name and title of exactly the column length', () => {
    expect(() =>
      tool().parseInput({
        name: 'A'.repeat(MAX_VARCHAR_LENGTH),
        title: 'T'.repeat(MAX_VARCHAR_LENGTH),
        manifest: {},
      })
    ).not.toThrow();
  });
});

it('is registered read-write, OWOX-internal, with the right scope', () => {
  const registry = new McpToolRegistry([
    new ConnectorPublishTool({} as McpConnectorAuthoringFacade, origin),
  ]);
  expect(new ConnectorPublishTool({} as McpConnectorAuthoringFacade, origin)).toMatchObject({
    name: 'connector_publish',
    requiredScopes: ['mcp:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  });
  expect(MCP_TOOL_PROVIDER_CLASSES.map(t => t.name)).toContain('ConnectorPublishTool');
  expect(registry.getTool('connector_publish')).toBeDefined();
});
