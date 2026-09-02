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

  const updatedReport = {
    report_id: 'report-1',
    status: 'updated' as const,
    destination_type: 'google_sheets' as const,
    name: 'New name',
    fields: ['channel'],
    filters: [],
    slices: [],
    aggregations: [],
    date_buckets: [],
    sort: [],
    limit: null,
    spreadsheet_id: 'ss-1',
    sheet_url: 'https://docs.google.com/spreadsheets/d/ss-1/edit#gid=0',
  };

  it('updates a report and returns its resulting definition plus the queued refresh run', async () => {
    const facade = {
      updateReport: jest.fn().mockResolvedValue({
        ...updatedReport,
        run: { status: 'queued', run_id: 'run-1' },
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    const structuredContent = {
      ...updatedReport,
      run: {
        status: 'queued',
        run_id: 'run-1',
        should_poll: true,
        message:
          'The report was updated and a refresh run was queued. Poll get_report_run_status with this report_id and run_id until should_poll is false. Do not call run_report for this refresh.',
      },
    };

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

  it('explains a skipped run differently for an explicit opt-out and a name-only change', async () => {
    const facade = {
      updateReport: jest.fn().mockResolvedValue({
        ...updatedReport,
        run: { status: 'not_requested' },
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    const optOut = await tool.handler(
      { report_id: 'report-1', fields: ['channel'], run_immediately: false },
      context
    );
    expect(facade.updateReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ runImmediately: false })
    );
    expect((optOut.structuredContent as { run: { message: string } }).run.message).toContain(
      'because run_immediately was false'
    );

    const renameOnly = await tool.handler({ report_id: 'report-1', name: 'New name' }, context);
    expect((renameOnly.structuredContent as { run: { message: string } }).run.message).toContain(
      'only its name or message changed'
    );
  });

  it('reports a refresh run that could not be queued without hiding the saved update', async () => {
    const facade = {
      updateReport: jest.fn().mockResolvedValue({
        ...updatedReport,
        run: { status: 'failed_to_queue', error: 'Report is already running or pending' },
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    const result = await tool.handler({ report_id: 'report-1', fields: ['channel'] }, context);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        status: 'updated',
        run: expect.objectContaining({
          status: 'failed_to_queue',
          should_poll: false,
          error: 'Report is already running or pending',
          message: expect.stringContaining('retry delivery with run_report'),
        }),
      })
    );
  });

  it('passes the message group through to the facade', async () => {
    const facade = {
      updateReport: jest
        .fn()
        .mockResolvedValue({ ...updatedReport, run: { status: 'not_requested' } }),
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

  it('maps filters and slices independently per placement, and [] into null (remove that kind)', async () => {
    const facade = {
      updateReport: jest
        .fn()
        .mockResolvedValue({ ...updatedReport, run: { status: 'not_requested' } }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    // filters alone touches only the post-join kind; slices stay undefined (keep current).
    await tool.handler(
      { report_id: 'report-1', filters: [{ field: 'purchases', operator: 'eq', value: 0 }] },
      context
    );
    expect(facade.updateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        postJoinFilters: [
          { column: 'purchases', operator: 'eq', value: 0, placement: 'post-join' },
        ],
        preJoinFilters: undefined,
      })
    );

    await tool.handler({ report_id: 'report-1', filters: [] }, context);
    expect(facade.updateReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ postJoinFilters: null, preJoinFilters: undefined })
    );

    // Omitted filters must stay undefined so the facade keeps the current ones.
    await tool.handler({ report_id: 'report-1', name: 'New name' }, context);
    expect(facade.updateReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ postJoinFilters: undefined, preJoinFilters: undefined })
    );
  });

  it('maps replacement aggregations, date buckets, sort, and limit; [] clears each', async () => {
    const facade = {
      updateReport: jest
        .fn()
        .mockResolvedValue({ ...updatedReport, run: { status: 'not_requested' } }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    await tool.handler(
      {
        report_id: 'report-1',
        slices: [{ field: 'source', operator: 'eq', value: 'ga4' }],
        aggregations: [{ field: 'revenue', function: 'SUM' }],
        date_buckets: [{ field: 'date', unit: 'MONTH' }],
        sort: [{ field: 'revenue', direction: 'desc' }],
        limit: 250,
      },
      context
    );
    expect(facade.updateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        preJoinFilters: [{ column: 'source', operator: 'eq', value: 'ga4', placement: 'pre-join' }],
        postJoinFilters: undefined,
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
        sortConfig: [{ column: 'revenue', direction: 'desc' }],
        limitConfig: 250,
      })
    );

    await tool.handler(
      { report_id: 'report-1', aggregations: [], date_buckets: [], sort: [], limit: null },
      context
    );
    expect(facade.updateReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aggregationConfig: null,
        dateTruncConfig: null,
        sortConfig: null,
        limitConfig: null,
      })
    );
  });

  it('passes an in filter through to the facade (natively supported)', async () => {
    const facade = {
      updateReport: jest
        .fn()
        .mockResolvedValue({ ...updatedReport, run: { status: 'not_requested' } }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new UpdateReportTool(facade);

    await tool.handler(
      { report_id: 'report-1', filters: [{ field: 'channel', operator: 'in', value: ['ads'] }] },
      context
    );

    expect(facade.updateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        postJoinFilters: [
          { column: 'channel', operator: 'in', value: ['ads'], placement: 'post-join' },
        ],
      })
    );
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
      'Provide at least one of fields, filters, slices, aggregations, date_buckets, sort, limit, name, or message'
    );
    // run_immediately alone changes nothing about the report.
    expect(() => tool.parseInput({ report_id: 'report-1', run_immediately: true })).toThrow(
      'Provide at least one of'
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
