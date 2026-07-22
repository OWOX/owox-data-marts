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

  it('maps replacement filters into domain rules, and [] into null (remove all)', async () => {
    const facade = {
      updateReport: jest.fn().mockResolvedValue({ report_id: 'report-1', status: 'updated' }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    await tool.handler(
      { report_id: 'report-1', filters: [{ field: 'purchases', operator: 'eq', value: 0 }] },
      context
    );
    expect(facade.updateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        filterConfig: [{ column: 'purchases', operator: 'eq', value: 0, placement: 'post-join' }],
      })
    );

    await tool.handler({ report_id: 'report-1', filters: [] }, context);
    expect(facade.updateReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ filterConfig: null })
    );

    // Omitted filters must stay undefined so the facade keeps the current ones.
    await tool.handler({ report_id: 'report-1', name: 'New name' }, context);
    expect(facade.updateReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ filterConfig: undefined })
    );
  });

  it('rejects an unsupported filter operator before touching the facade', async () => {
    const facade = {
      updateReport: jest.fn(),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    await expect(
      tool.handler(
        {
          report_id: 'report-1',
          filters: [{ field: 'channel', operator: 'in', value: ['ads'] }],
        },
        context
      )
    ).rejects.toThrow(/not supported yet.*Supported operators/);
    expect(facade.updateReport).not.toHaveBeenCalled();
  });

  it('accepts filters alone as a valid change', () => {
    const tool = new UpdateReportTool({} as McpReportsFacade);

    expect(() =>
      tool.parseInput({
        report_id: 'report-1',
        filters: [{ field: 'purchases', operator: 'eq', value: 0 }],
      })
    ).not.toThrow();
    // An explicit empty array is a valid change: it removes every filter.
    expect(() => tool.parseInput({ report_id: 'report-1', filters: [] })).not.toThrow();
  });

  it('requires at least one change and rejects malformed input', () => {
    const tool = new UpdateReportTool({} as McpReportsFacade);

    expect(() => tool.parseInput({ report_id: 'report-1' })).toThrow(
      'Provide at least one of fields, filters, name, or message'
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
