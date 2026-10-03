import type { McpConnectorsFacade } from '../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ConnectorListTool } from './connector-list.tool';
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

it('lists connectors using token project-member context', async () => {
  const connectors = [
    { name: 'GitHub', title: 'GitHub', description: 'Repos', kind: 'bundled', connectorId: null },
  ];
  const facade = {
    listConnectors: jest.fn().mockResolvedValue({ connectors }),
  } as unknown as jest.Mocked<McpConnectorsFacade>;
  const tool = new ConnectorListTool(facade);

  const structuredContent = {
    connectors: [
      {
        name: 'GitHub',
        title: 'GitHub',
        description: 'Repos',
        kind: 'bundled',
        connector_id: null,
      },
    ],
  };
  await expect(tool.handler({}, context)).resolves.toEqual({
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  });
  expect(facade.listConnectors).toHaveBeenCalledWith({
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['viewer'],
  });
});

it('maps connectorId onto the wire as connector_id: the definition id for a custom connector, null for bundled', async () => {
  const connectors = [
    { name: 'GitHub', title: 'GitHub', description: 'Repos', kind: 'bundled', connectorId: null },
    { name: 'MyApi', title: 'My API', description: null, kind: 'custom', connectorId: 'def-1' },
  ];
  const facade = {
    listConnectors: jest.fn().mockResolvedValue({ connectors }),
  } as unknown as jest.Mocked<McpConnectorsFacade>;
  const tool = new ConnectorListTool(facade);

  const result = await tool.handler({}, context);
  const byName = Object.fromEntries(
    (
      result.structuredContent as {
        connectors: Array<{ name: string; connector_id: string | null }>;
      }
    ).connectors.map(c => [c.name, c.connector_id])
  );
  expect(byName['GitHub']).toBeNull();
  expect(byName['MyApi']).toBe('def-1');
});

it('rejects unexpected input', () => {
  const tool = new ConnectorListTool({} as McpConnectorsFacade);
  expect(() => tool.parseInput({ project_id: 'x' })).toThrow();
});

it('is registered read-only with the right scope', () => {
  const registry = new McpToolRegistry([new ConnectorListTool({} as McpConnectorsFacade)]);
  expect(new ConnectorListTool({} as McpConnectorsFacade)).toMatchObject({
    name: 'connector_list',
    requiredScopes: ['mcp:read'],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  });
  expect(MCP_TOOL_PROVIDER_CLASSES.map(t => t.name)).toContain('ConnectorListTool');
  expect(registry.getTool('connector_list')).toBeDefined();
});
