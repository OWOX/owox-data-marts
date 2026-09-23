import type { McpConnectorAuthoringFacade } from '../../../data-marts/facades/mcp-connector-authoring.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ConnectorTestTool } from './connector-test.tool';
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

it('runs a connector test using token project-member context, mapping max_rows/max_pages', async () => {
  const authoring = {
    testConnector: jest.fn().mockResolvedValue({
      rows: [{ id: 1 }],
      sample: [{ raw: true }],
      error: null,
      logs: ['fetched page 1'],
    }),
  } as unknown as jest.Mocked<McpConnectorAuthoringFacade>;
  const tool = new ConnectorTestTool(authoring);

  const input = {
    manifest: { nodes: { Repos: {} } },
    node: 'Repos',
    configuration: { ApiKey: 'nonsecret-placeholder' },
    max_rows: 5,
    max_pages: 2,
  };

  const structuredContent = {
    rows: [{ id: 1 }],
    sample: [{ raw: true }],
    error: null,
    logs: ['fetched page 1'],
  };
  await expect(tool.handler(input, context)).resolves.toEqual({
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  });
  expect(authoring.testConnector).toHaveBeenCalledWith({
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
    manifest: { nodes: { Repos: {} } },
    node: 'Repos',
    configuration: { ApiKey: 'nonsecret-placeholder' },
    maxRows: 5,
    maxPages: 2,
  });
});

/**
 * `rows: []` with `error: null` is the shape of the most common connector bug (a
 * recordPath that matches nothing), and it is indistinguishable from a genuine empty
 * result without the log trail. Declaring `logs` in the output schema is what makes the
 * diagnostic reach the caller rather than being dropped at this boundary.
 */
it('declares logs in its output schema and describes them', () => {
  const tool = new ConnectorTestTool({} as McpConnectorAuthoringFacade);
  expect(Object.keys(tool.outputSchema).sort()).toEqual(['error', 'logs', 'rows', 'sample']);
  expect(tool.outputSchema.logs.parse(['a', 'b'])).toEqual(['a', 'b']);
  expect(tool.description).toMatch(/logs/i);
});

it('rejects input missing required manifest and node', () => {
  const tool = new ConnectorTestTool({} as McpConnectorAuthoringFacade);
  expect(() => tool.parseInput({})).toThrow();
});

it('is registered read-write with the right scope', () => {
  const registry = new McpToolRegistry([new ConnectorTestTool({} as McpConnectorAuthoringFacade)]);
  expect(new ConnectorTestTool({} as McpConnectorAuthoringFacade)).toMatchObject({
    name: 'connector_test',
    requiredScopes: ['mcp:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  });
  expect(MCP_TOOL_PROVIDER_CLASSES.map(t => t.name)).toContain('ConnectorTestTool');
  expect(registry.getTool('connector_test')).toBeDefined();
});
