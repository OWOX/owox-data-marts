import type { McpReportsFacade } from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { RunReportTool } from './run-report.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('RunReportTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read', 'mcp:write'],
    authFlow: 'mcp',
  };

  it('starts a report run and returns only the report and run ids', async () => {
    const facade = {
      runReport: jest.fn().mockResolvedValue({
        reportId: 'report-1',
        runId: 'run-1',
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new RunReportTool(facade);

    const structuredContent = {
      report_id: 'report-1',
      run_id: 'run-1',
    };

    await expect(tool.handler({ report_id: 'report-1' }, context)).resolves.toEqual({
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    });
    expect(facade.runReport).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      reportId: 'report-1',
    });
  });

  it('rejects missing report_id and unexpected input', () => {
    const tool = new RunReportTool({} as McpReportsFacade);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ report_id: '' })).toThrow();
    expect(() => tool.parseInput({ report_id: 'report-1', project_id: 'other' })).toThrow();
  });

  it('is registered with write metadata and the right scope', () => {
    const registry = new McpToolRegistry([new RunReportTool({} as McpReportsFacade)]);

    expect(new RunReportTool({} as McpReportsFacade)).toMatchObject({
      name: 'run_report',
      requiredScopes: ['mcp:write'],
      outputSchema: {
        report_id: expect.any(Object),
        run_id: expect.any(Object),
      },
      annotations: {
        title: 'Run Report',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('RunReportTool');
    expect(registry.getTool('run_report')).toBeDefined();
  });

  it('does not expose status, started_at, or error — only get_report_run_status does', () => {
    const tool = new RunReportTool({} as McpReportsFacade);

    expect(Object.keys(tool.outputSchema).sort()).toEqual(['report_id', 'run_id']);
  });

  it('points the caller at the polling tool in the description', () => {
    const tool = new RunReportTool({} as McpReportsFacade);

    expect(tool.description).toContain('get_report_run_status');
    expect(tool.description).toContain('does not wait');
    expect(tool.description).toContain('run_id');
    expect(tool.description).toContain('15 seconds');
    expect(tool.description).toContain('billed');
    expect(tool.description).not.toContain('do not stop polling on your own initiative');
    expect(tool.description).not.toContain('60 seconds');
  });
});
