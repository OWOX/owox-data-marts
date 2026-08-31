import type { McpReportsFacade } from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { GetReportOutputSchemaTool } from './get-report-output-schema.tool';
import { McpToolRegistry } from './mcp-tool.registry';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('GetReportOutputSchemaTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  const columns = [
    { name: 'date', title: 'Date', description: 'Reporting day', type: 'DATE' },
    { name: 'revenue | SUM', title: 'Revenue, $ | SUM', description: null, type: 'NUMERIC' },
    { name: 'Unique Count', title: null, description: null, type: 'INTEGER' },
  ];

  it('returns the report columns using token project-member context', async () => {
    const facade = {
      getReportOutputSchema: jest.fn().mockResolvedValue({ reportId: 'report-1', columns }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new GetReportOutputSchemaTool(facade);

    const structuredContent = { report_id: 'report-1', columns };

    await expect(tool.handler({ report_id: 'report-1' }, context)).resolves.toEqual({
      structuredContent,
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    });
    expect(facade.getReportOutputSchema).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      reportId: 'report-1',
    });
  });

  it('rejects an input that names no report, or carries anything extra', () => {
    const tool = new GetReportOutputSchemaTool({} as McpReportsFacade);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ report_id: '' })).toThrow();
    expect(() => tool.parseInput({ report_id: 'report-1', limit: 10 })).toThrow();
    expect(tool.parseInput({ report_id: 'report-1' })).toEqual({ report_id: 'report-1' });
  });

  // Describing a report reads nothing and changes nothing: an MCP client that only holds
  // `mcp:read` must be able to call it, and it must not be advertised as a mutation.
  it('is registered as a read-only tool requiring only the read scope', () => {
    const registry = new McpToolRegistry([new GetReportOutputSchemaTool({} as McpReportsFacade)]);

    expect(new GetReportOutputSchemaTool({} as McpReportsFacade)).toMatchObject({
      name: 'get_report_output_schema',
      requiredScopes: ['mcp:read'],
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('GetReportOutputSchemaTool');
    expect(registry.getTool('get_report_output_schema')).toBeDefined();
  });
});
