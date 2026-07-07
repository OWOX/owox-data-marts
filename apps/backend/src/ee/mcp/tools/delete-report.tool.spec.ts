import type { McpReportsFacade } from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { DeleteReportTool } from './delete-report.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('DeleteReportTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    email: 'ann@owox.com',
    roles: ['editor'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:write'],
    authFlow: 'mcp',
  };

  it('deletes a report and returns the confirmation shape', async () => {
    const facade = {
      deleteReport: jest.fn().mockResolvedValue({ report_id: 'report-1', status: 'deleted' }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new DeleteReportTool(facade);

    const structuredContent = { report_id: 'report-1', status: 'deleted' };

    await expect(tool.handler({ report_id: 'report-1' }, context)).resolves.toEqual({
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    });
    expect(facade.deleteReport).toHaveBeenCalledWith({
      reportId: 'report-1',
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
    });
  });

  it('requires report_id and rejects unexpected input', () => {
    const tool = new DeleteReportTool({} as McpReportsFacade);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ report_id: '' })).toThrow();
    expect(() => tool.parseInput({ report_id: 'report-1', extra: true })).toThrow();
  });

  it('propagates facade errors instead of swallowing them', async () => {
    const facade = {
      deleteReport: jest.fn().mockRejectedValue(new Error('Report with ID report-1 not found')),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new DeleteReportTool(facade);

    await expect(tool.handler({ report_id: 'report-1' }, context)).rejects.toThrow('not found');
  });

  it('is registered as a destructive write tool with the mcp:write scope', () => {
    const registry = new McpToolRegistry([new DeleteReportTool({} as McpReportsFacade)]);

    expect(new DeleteReportTool({} as McpReportsFacade)).toMatchObject({
      name: 'delete_report',
      requiredScopes: ['mcp:write'],
      annotations: {
        title: 'Delete Report',
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('DeleteReportTool');
    expect(registry.getTool('delete_report')).toBeDefined();
  });
});
