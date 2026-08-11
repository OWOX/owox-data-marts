import type { McpConnectorRunFacade } from '../../../data-marts/facades/mcp-connector-run.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ConnectorRunStatusTool } from './connector-run-status.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

const context: McpAuthContext = {
  clientId: 'c1',
  userId: 'user-1',
  projectId: 'project-1',
  roles: ['viewer'],
  resource: 'https://mcp.owox.com/mcp',
  scopes: ['mcp:read', 'mcp:write'],
  authFlow: 'mcp',
};

it('gets connector run status and returns mapped fields', async () => {
  const facade = {
    getConnectorRunStatus: jest.fn().mockResolvedValue({
      runId: 'run_1',
      dataMartId: 'dm_1',
      status: 'SUCCESS',
      runType: 'MANUAL',
      startedAt: '2026-06-10T10:00:00.000Z',
      finishedAt: '2026-06-10T10:05:00.000Z',
      lastLogs: ['log line 1', 'log line 2'],
      errors: [],
    }),
  } as unknown as jest.Mocked<McpConnectorRunFacade>;
  const tool = new ConnectorRunStatusTool(facade);

  const structured = {
    run_id: 'run_1',
    data_mart_id: 'dm_1',
    status: 'SUCCESS',
    run_type: 'MANUAL',
    started_at: '2026-06-10T10:00:00.000Z',
    finished_at: '2026-06-10T10:05:00.000Z',
    last_logs: ['log line 1', 'log line 2'],
    errors: [],
  };
  await expect(tool.handler({ data_mart_id: 'dm_1', run_id: 'run_1' }, context)).resolves.toEqual({
    structuredContent: structured,
    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
  });
  expect(facade.getConnectorRunStatus).toHaveBeenCalledWith({
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['viewer'],
    dataMartId: 'dm_1',
    runId: 'run_1',
  });
});

it('rejects missing input and is registered read-scoped', () => {
  const tool = new ConnectorRunStatusTool({} as McpConnectorRunFacade);
  expect(() => tool.parseInput({})).toThrow();
  expect(tool).toMatchObject({
    name: 'connector_run_status',
    requiredScopes: ['mcp:read'],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  });
  expect(MCP_TOOL_PROVIDER_CLASSES.map(t => t.name)).toContain('ConnectorRunStatusTool');
  expect(
    new McpToolRegistry([new ConnectorRunStatusTool({} as McpConnectorRunFacade)]).getTool(
      'connector_run_status'
    )
  ).toBeDefined();
});
