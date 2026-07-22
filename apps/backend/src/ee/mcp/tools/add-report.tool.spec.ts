import { BadRequestException } from '@nestjs/common';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { McpReportsFacade } from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { AddReportTool } from './add-report.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('AddReportTool', () => {
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
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;

  const input = {
    data_mart_id: 'dm-1',
    destination_id: 'dest-1',
    fields: ['channel', 'revenue'],
    name: 'Weekly revenue',
  };

  it('creates a report and returns the report and sheet links', async () => {
    const facade = {
      addReport: jest.fn().mockResolvedValue({
        report_id: 'report-1',
        destination_type: 'google_sheets',
        owner: 'ann@owox.com',
        status: 'created',
        sheet_url: 'https://docs.google.com/spreadsheets/d/ss-1/edit#gid=0',
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    const structuredContent = {
      report_id: 'report-1',
      destination_type: 'google_sheets',
      report_url: 'https://app.owox.com/ui/project-1/data-marts/dm-1/reports',
      sheet_url: 'https://docs.google.com/spreadsheets/d/ss-1/edit#gid=0',
      owner: 'ann@owox.com',
      status: 'created',
    };

    await expect(tool.handler(input, context)).resolves.toEqual({
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    });
    expect(facade.addReport).toHaveBeenCalledWith({
      dataMartId: 'dm-1',
      destinationId: 'dest-1',
      fields: ['channel', 'revenue'],
      name: 'Weekly revenue',
      projectId: 'project-1',
      userId: 'user-1',
      userEmail: 'ann@owox.com',
      roles: ['editor'],
    });
  });

  it('creates a Looker Studio report with connection guidance instead of sheet fields', async () => {
    const facade = {
      addReport: jest.fn().mockResolvedValue({
        report_id: 'report-2',
        destination_type: 'looker_studio',
        owner: 'ann@owox.com',
        status: 'created',
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    const result = await tool.handler(input, context);

    expect(result.structuredContent).toMatchObject({
      report_id: 'report-2',
      destination_type: 'looker_studio',
      report_url: 'https://app.owox.com/ui/project-1/data-marts/dm-1/reports',
      owner: 'ann@owox.com',
      status: 'created',
      setup_guide_url:
        'https://docs.owox.com/docs/destinations/supported-destinations/data-studio/',
    });
    // The user must finish the connection themselves — the secret never goes
    // through MCP — so the agent gets explicit instructions to relay.
    expect(result.structuredContent).toHaveProperty('instructions');
    expect((result.structuredContent as { instructions: string }).instructions).toContain(
      'JSON Config'
    );
    expect(result.structuredContent).not.toHaveProperty('sheet_url');
    expect(result.structuredContent).not.toHaveProperty('placed_in_root');
    expect(result.structuredContent).not.toHaveProperty('shared_with_requester');
    expect((result.content[0] as { text: string }).text).not.toContain('sheet_url');
  });

  it('adds no connection guidance for non-Looker destinations', async () => {
    const facade = {
      addReport: jest.fn().mockResolvedValue({
        report_id: 'report-4',
        destination_type: 'slack',
        owner: 'ann@owox.com',
        status: 'created',
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    const result = await tool.handler({ ...input, message: { body: '{{table}}' } }, context);

    expect(result.structuredContent).toMatchObject({ destination_type: 'slack' });
    expect(result.structuredContent).not.toHaveProperty('instructions');
    expect(result.structuredContent).not.toHaveProperty('setup_guide_url');
  });

  it('surfaces sheet placement and sharing warnings when present', async () => {
    const facade = {
      addReport: jest.fn().mockResolvedValue({
        report_id: 'report-1',
        owner: null,
        status: 'created',
        sheet_url: 'https://docs.google.com/spreadsheets/d/ss-1/edit#gid=0',
        placed_in_root: true,
        shared_with_requester: false,
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    const result = await tool.handler(input, context);

    expect(result.structuredContent).toMatchObject({
      placed_in_root: true,
      shared_with_requester: false,
    });
    expect((result.content[0] as { text: string }).text).toContain(
      '"shared_with_requester": false'
    );
  });

  it('passes the message group through to the facade for email-family reports', async () => {
    const facade = {
      addReport: jest.fn().mockResolvedValue({
        report_id: 'report-3',
        owner: 'ann@owox.com',
        status: 'created',
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    await tool.handler(
      { ...input, message: { subject: 'Revenue digest', body: '{{table}}' } },
      context
    );

    expect(facade.addReport).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { subject: 'Revenue digest', body: '{{table}}' },
      })
    );
  });

  it('maps filters into the domain filter rules for the facade', async () => {
    const facade = {
      addReport: jest.fn().mockResolvedValue({
        report_id: 'report-6',
        destination_type: 'google_sheets',
        owner: 'ann@owox.com',
        status: 'created',
        sheet_url: 'https://docs.google.com/spreadsheets/d/ss-1/edit#gid=0',
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    await tool.handler(
      {
        ...input,
        filters: [
          { field: 'purchases', operator: 'eq', value: 0 },
          { field: 'created_at', operator: 'in_last_n_days', value: 30 },
        ],
      },
      context
    );

    expect(facade.addReport).toHaveBeenCalledWith(
      expect.objectContaining({
        filterConfig: [
          { column: 'purchases', operator: 'eq', value: 0, placement: 'post-join' },
          {
            column: 'created_at',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 30 },
            placement: 'post-join',
          },
        ],
      })
    );
  });

  it('maps slices, aggregations, date buckets, sort, and limit into domain configs', async () => {
    const facade = {
      addReport: jest.fn().mockResolvedValue({
        report_id: 'report-7',
        destination_type: 'google_sheets',
        owner: 'ann@owox.com',
        status: 'created',
        sheet_url: 'https://docs.google.com/spreadsheets/d/ss-1/edit#gid=0',
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    await tool.handler(
      {
        ...input,
        slices: [{ field: 'source', operator: 'eq', value: 'ga4' }],
        aggregations: [{ field: 'revenue', function: 'SUM' }],
        date_buckets: [{ field: 'date', unit: 'MONTH' }],
        sort: [{ field: 'revenue', direction: 'desc' }],
        limit: 500,
      },
      context
    );

    expect(facade.addReport).toHaveBeenCalledWith(
      expect.objectContaining({
        filterConfig: [{ column: 'source', operator: 'eq', value: 'ga4', placement: 'pre-join' }],
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
        sortConfig: [{ column: 'revenue', direction: 'desc' }],
        limitConfig: 500,
      })
    );
  });

  it('passes an in filter through to the facade (natively supported)', async () => {
    const facade = {
      addReport: jest.fn().mockResolvedValue({
        report_id: 'report-6',
        destination_type: 'google_sheets',
        owner: 'ann@owox.com',
        status: 'created',
        sheet_url: 'https://docs.google.com/spreadsheets/d/ss-1/edit#gid=0',
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    await tool.handler(
      { ...input, filters: [{ field: 'channel', operator: 'in', value: ['ads', 'email'] }] },
      context
    );

    expect(facade.addReport).toHaveBeenCalledWith(
      expect.objectContaining({
        filterConfig: [
          { column: 'channel', operator: 'in', value: ['ads', 'email'], placement: 'post-join' },
        ],
      })
    );
  });

  it('translates output-controls validation errors from the facade into agent guidance', async () => {
    const facade = {
      addReport: jest.fn().mockRejectedValue(
        new BadRequestException({
          message: 'Output controls validation failed',
          details: { errors: [{ code: 'AGGREGATION_REQUIRES_COLUMN_CONFIG' }] },
        })
      ),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new AddReportTool(facade, publicOrigin);

    // fields ['*'] + aggregations is a plausible agent mistake ("export everything,
    // summed"); the opaque validator message must become an actionable fix.
    await expect(
      tool.handler(
        { ...input, fields: ['*'], aggregations: [{ field: 'revenue', function: 'SUM' }] },
        context
      )
    ).rejects.toThrow(/explicit column selection/);
  });

  it('validates required input and rejects unexpected keys', () => {
    const tool = new AddReportTool({} as McpReportsFacade, publicOrigin);

    expect(() => tool.parseInput({ destination_id: 'd', fields: ['*'], name: 'x' })).toThrow();
    expect(() => tool.parseInput({ ...input, fields: [] })).toThrow();
    // Empty output-control arrays on create are caller mistakes — omit them instead.
    expect(() => tool.parseInput({ ...input, filters: [] })).toThrow();
    expect(() => tool.parseInput({ ...input, filters: [{ field: 'x' }] })).toThrow();
    expect(() => tool.parseInput({ ...input, slices: [] })).toThrow();
    expect(() => tool.parseInput({ ...input, aggregations: [] })).toThrow();
    expect(() =>
      tool.parseInput({ ...input, aggregations: [{ field: 'x', function: 'NOPE' }] })
    ).toThrow();
    expect(() => tool.parseInput({ ...input, date_buckets: [] })).toThrow();
    expect(() => tool.parseInput({ ...input, sort: [] })).toThrow();
    expect(() =>
      tool.parseInput({ ...input, sort: [{ field: 'x', direction: 'sideways' }] })
    ).toThrow();
    expect(() => tool.parseInput({ ...input, limit: 0 })).toThrow();
    expect(() => tool.parseInput({ ...input, extra: true })).toThrow();
  });

  it('accepts input without a name (Looker Studio reports carry none)', () => {
    const tool = new AddReportTool({} as McpReportsFacade, publicOrigin);

    const parsed = tool.parseInput({
      data_mart_id: 'dm-1',
      destination_id: 'dest-1',
      fields: ['*'],
    });

    expect(parsed.name).toBeUndefined();
  });

  it('validates the message group when present', () => {
    const tool = new AddReportTool({} as McpReportsFacade, publicOrigin);

    // body is required inside message; unexpected keys are rejected;
    // subject and body are trimmed like the report name.
    expect(() => tool.parseInput({ ...input, message: {} })).toThrow();
    expect(() => tool.parseInput({ ...input, message: { body: '   ' } })).toThrow();
    expect(() =>
      tool.parseInput({ ...input, message: { body: '{{table}}', send_condition: 'ALWAYS' } })
    ).toThrow();
    expect(
      tool.parseInput({ ...input, message: { subject: '  Digest  ', body: ' {{table}} ' } }).message
    ).toEqual({ subject: 'Digest', body: '{{table}}' });
    expect(tool.parseInput(input).message).toBeUndefined();
  });

  it('trims the report name and rejects whitespace-only names', () => {
    const tool = new AddReportTool({} as McpReportsFacade, publicOrigin);

    expect(tool.parseInput({ ...input, name: '  Weekly revenue  ' }).name).toBe('Weekly revenue');
    expect(() => tool.parseInput({ ...input, name: '   ' })).toThrow();
  });

  it('is registered as a write tool with the mcp:write scope', () => {
    const registry = new McpToolRegistry([new AddReportTool({} as McpReportsFacade, publicOrigin)]);

    expect(new AddReportTool({} as McpReportsFacade, publicOrigin)).toMatchObject({
      name: 'add_report',
      requiredScopes: ['mcp:write'],
      annotations: {
        title: 'Add Report',
        readOnlyHint: false,
        destructiveHint: false,
        // The tool creates (and may share) a document in Google Drive.
        openWorldHint: true,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('AddReportTool');
    expect(registry.getTool('add_report')).toBeDefined();
  });
});
