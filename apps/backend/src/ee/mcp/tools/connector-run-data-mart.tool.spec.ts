import type { McpConnectorRunFacade } from '../../../data-marts/facades/mcp-connector-run.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ConnectorRunDataMartTool } from './connector-run-data-mart.tool';
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

it('starts a connector data mart run and returns run id + status', async () => {
  const facade = {
    runConnectorDataMart: jest.fn().mockResolvedValue({ runId: 'run_1', status: 'PENDING' }),
  } as unknown as jest.Mocked<McpConnectorRunFacade>;
  const tool = new ConnectorRunDataMartTool(facade);

  const structured = { run_id: 'run_1', status: 'PENDING' };
  await expect(tool.handler({ data_mart_id: 'dm_1' }, context)).resolves.toEqual({
    structuredContent: structured,
    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
  });
  expect(facade.runConnectorDataMart).toHaveBeenCalledWith({
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
    dataMartId: 'dm_1',
  });
});

it('rejects missing input and is registered write-scoped', () => {
  const tool = new ConnectorRunDataMartTool({} as McpConnectorRunFacade);
  expect(() => tool.parseInput({})).toThrow();
  expect(tool).toMatchObject({
    name: 'connector_run_data_mart',
    requiredScopes: ['mcp:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  });
  expect(MCP_TOOL_PROVIDER_CLASSES.map(t => t.name)).toContain('ConnectorRunDataMartTool');
  expect(
    new McpToolRegistry([new ConnectorRunDataMartTool({} as McpConnectorRunFacade)]).getTool(
      'connector_run_data_mart'
    )
  ).toBeDefined();
});
