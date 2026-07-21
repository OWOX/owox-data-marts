import type { McpReportsFacade } from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { UpdateReportTool } from './update-report.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('UpdateReportTool', () => {
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

  it('updates a report and returns the minimal PRD shape', async () => {
    const facade = {
      updateReport: jest.fn().mockResolvedValue({ report_id: 'report-1', status: 'updated' }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    const structuredContent = { report_id: 'report-1', status: 'updated' };

    await expect(
      tool.handler({ report_id: 'report-1', name: 'New name', fields: ['channel'] }, context)
    ).resolves.toEqual({
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    });
    expect(facade.updateReport).toHaveBeenCalledWith({
      reportId: 'report-1',
      fields: ['channel'],
      name: 'New name',
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
    });
  });

  it('passes the message group through to the facade', async () => {
    const facade = {
      updateReport: jest.fn().mockResolvedValue({ report_id: 'report-1', status: 'updated' }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    await tool.handler(
      { report_id: 'report-1', message: { subject: 'New subject', body: 'New body' } },
      context
    );

    expect(facade.updateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'report-1',
        message: { subject: 'New subject', body: 'New body' },
      })
    );
  });

  it('requires at least one change and rejects malformed input', () => {
    const tool = new UpdateReportTool({} as McpReportsFacade);

    expect(() => tool.parseInput({ report_id: 'report-1' })).toThrow(
      'Provide at least one of fields, name, or message'
    );
    expect(() => tool.parseInput({ name: 'New name' })).toThrow();
    expect(() => tool.parseInput({ report_id: 'report-1', fields: [] })).toThrow();
    expect(() => tool.parseInput({ report_id: 'report-1', name: 'x', extra: true })).toThrow();
    // A message alone is a valid change, but it must contain something.
    expect(() =>
      tool.parseInput({ report_id: 'report-1', message: { subject: 'Digest' } })
    ).not.toThrow();
    expect(() => tool.parseInput({ report_id: 'report-1', message: {} })).toThrow(
      'Provide at least one of message.subject or message.body'
    );
    expect(() =>
      tool.parseInput({ report_id: 'report-1', message: { body: 'x', extra: true } })
    ).toThrow();
  });

  it('trims the new name and rejects whitespace-only names', () => {
    const tool = new UpdateReportTool({} as McpReportsFacade);

    expect(tool.parseInput({ report_id: 'report-1', name: '  New name  ' }).name).toBe('New name');
    expect(() => tool.parseInput({ report_id: 'report-1', name: '   ' })).toThrow();
  });

  it('is registered as a write tool with the mcp:write scope', () => {
    const registry = new McpToolRegistry([new UpdateReportTool({} as McpReportsFacade)]);

    expect(new UpdateReportTool({} as McpReportsFacade)).toMatchObject({
      name: 'update_report',
      requiredScopes: ['mcp:write'],
      annotations: {
        title: 'Update Report',
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('UpdateReportTool');
    expect(registry.getTool('update_report')).toBeDefined();
  });
});
