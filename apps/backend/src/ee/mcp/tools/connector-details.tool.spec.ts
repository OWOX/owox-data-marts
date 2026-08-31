import type { McpConnectorsFacade } from '../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ConnectorDetailsTool } from './connector-details.tool';
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

it('gets connector details using token project-member context', async () => {
  const details = {
    name: 'GitHub',
    connectorId: null,
    configFields: [{ name: 'apiKey' }],
    nodes: [{ name: 'Repos' }],
    manifest: null,
  };
  const facade = {
    getConnectorDetails: jest.fn().mockResolvedValue(details),
  } as unknown as jest.Mocked<McpConnectorsFacade>;
  const tool = new ConnectorDetailsTool(facade);

  const structuredContent = {
    name: 'GitHub',
    connector_id: null,
    configFields: [{ name: 'apiKey' }],
    nodes: [{ name: 'Repos' }],
    manifest: null,
  };
  await expect(tool.handler({ connector: 'GitHub', version: 3 }, context)).resolves.toEqual({
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  });
  expect(facade.getConnectorDetails).toHaveBeenCalledWith({
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['viewer'],
    connector: 'GitHub',
    version: 3,
  });
});

it('maps connectorId onto the wire as connector_id: the definition id for a custom connector', async () => {
  const details = {
    name: 'CocCocAds',
    connectorId: 'def-cc',
    configFields: [],
    nodes: [],
    manifest: { name: 'CocCocAds', version: '1.0' },
  };
  const facade = {
    getConnectorDetails: jest.fn().mockResolvedValue(details),
  } as unknown as jest.Mocked<McpConnectorsFacade>;
  const tool = new ConnectorDetailsTool(facade);

  const result = await tool.handler({ connector: 'CocCocAds' }, context);
  expect((result.structuredContent as { connector_id: string | null }).connector_id).toBe('def-cc');
});

it('rejects missing connector', () => {
  const tool = new ConnectorDetailsTool({} as McpConnectorsFacade);
  expect(() => tool.parseInput({})).toThrow();
});

it('is registered read-only with the right scope', () => {
  const registry = new McpToolRegistry([new ConnectorDetailsTool({} as McpConnectorsFacade)]);
  expect(new ConnectorDetailsTool({} as McpConnectorsFacade)).toMatchObject({
    name: 'connector_details',
    requiredScopes: ['mcp:read'],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  });
  expect(MCP_TOOL_PROVIDER_CLASSES.map(t => t.name)).toContain('ConnectorDetailsTool');
  expect(registry.getTool('connector_details')).toBeDefined();
});
