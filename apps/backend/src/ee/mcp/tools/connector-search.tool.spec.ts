import type { McpConnectorsFacade } from '../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ConnectorSearchTool } from './connector-search.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

const context: McpAuthContext = {
  clientId: 'c1',
  userId: 'user-1',
  projectId: 'project-1',
  roles: ['viewer'],
  resource: 'https://mcp.owox.com/mcp',
  scopes: ['mcp:read'],
  authFlow: 'mcp',
};

it('matches connectors by prompt using token project-member context', async () => {
  const connectors = [
    {
      name: 'FacebookMarketing',
      title: 'Facebook Marketing',
      description: 'Ads data',
      kind: 'bundled',
      relevanceScore: 2,
      connectorId: null,
    },
  ];
  const facade = {
    matchByPrompt: jest.fn().mockResolvedValue({ connectors }),
  } as unknown as jest.Mocked<McpConnectorsFacade>;
  const tool = new ConnectorSearchTool(facade);

  const structuredContent = {
    connectors: [
      {
        name: 'FacebookMarketing',
        title: 'Facebook Marketing',
        description: 'Ads data',
        kind: 'bundled',
        relevanceScore: 2,
        connector_id: null,
      },
    ],
  };
  const result = await tool.handler({ prompt: 'facebook ads', limit: 5 }, context);
  await expect(Promise.resolve(result)).resolves.toEqual({
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  });
  expect(facade.matchByPrompt).toHaveBeenCalledWith({
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['viewer'],
    prompt: 'facebook ads',
    limit: 5,
  });
});

it('maps connectorId onto the wire as connector_id: the definition id for a custom connector, null for bundled', async () => {
  const connectors = [
    {
      name: 'GitHub',
      title: 'GitHub',
      description: 'ads',
      kind: 'bundled',
      relevanceScore: 1,
      connectorId: null,
    },
    {
      name: 'AdsApi',
      title: 'Ads Api',
      description: 'ads',
      kind: 'custom',
      relevanceScore: 1,
      connectorId: 'def-9',
    },
  ];
  const facade = {
    matchByPrompt: jest.fn().mockResolvedValue({ connectors }),
  } as unknown as jest.Mocked<McpConnectorsFacade>;
  const tool = new ConnectorSearchTool(facade);

  const result = await tool.handler({ prompt: 'ads' }, context);
  const byName = Object.fromEntries(
    (
      result.structuredContent as {
        connectors: Array<{ name: string; connector_id: string | null }>;
      }
    ).connectors.map(c => [c.name, c.connector_id])
  );
  expect(byName['GitHub']).toBeNull();
  expect(byName['AdsApi']).toBe('def-9');
});

it('rejects missing prompt', () => {
  const tool = new ConnectorSearchTool({} as McpConnectorsFacade);
  expect(() => tool.parseInput({})).toThrow();
});

it('is registered read-only with the right scope', () => {
  const registry = new McpToolRegistry([new ConnectorSearchTool({} as McpConnectorsFacade)]);
  expect(new ConnectorSearchTool({} as McpConnectorsFacade)).toMatchObject({
    name: 'connector_search',
    requiredScopes: ['mcp:read'],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  });
  expect(MCP_TOOL_PROVIDER_CLASSES.map(t => t.name)).toContain('ConnectorSearchTool');
  expect(registry.getTool('connector_search')).toBeDefined();
});
