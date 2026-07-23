import type { McpReportsFacade } from '../../../data-marts/facades/mcp-reports.facade';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { GetDataMartReportsTool } from './get-data-mart-reports.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('GetDataMartReportsTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;

  it('lists a data mart reports using token project-member context', async () => {
    const reports = [
      {
        report_id: 'r1',
        data_mart_id: 'dm-1',
        name: 'Weekly revenue',
        destination_id: 'dest-1',
        destination_type: 'google_sheets' as const,
        owner: 'ann@owox.com',
        schedules: [
          {
            trigger_id: 'trigger-1',
            cron_expression: '0 9 * * 1',
            time_zone: 'Europe/Kyiv',
            is_active: true,
            next_run_at: '2026-06-15T06:00:00.000Z',
            last_run_at: '2026-06-08T06:00:00.000Z',
          },
        ],
        last_run_at: '2026-06-10T10:00:00.000Z',
        last_run_status: 'SUCCESS' as const,
      },
    ];
    const facade = {
      getDataMartReports: jest.fn().mockResolvedValue({ reports }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new GetDataMartReportsTool(facade, publicOrigin);

    const structuredContent = {
      reports: reports.map(report => ({
        ...report,
        report_url: 'https://app.owox.com/ui/project-1/data-marts/dm-1/reports',
        destination_url: 'https://app.owox.com/ui/project-1/data-destinations?id=dest-1',
      })),
    };

    await expect(tool.handler({ data_mart_id: 'dm-1' }, context)).resolves.toEqual({
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    });
    expect(facade.getDataMartReports).toHaveBeenCalledWith({
      dataMartId: 'dm-1',
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });
  });

  it('requires data_mart_id and rejects unexpected input', () => {
    const tool = new GetDataMartReportsTool({} as McpReportsFacade, publicOrigin);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ data_mart_id: 'dm-1', extra: true })).toThrow();
  });

  it('is registered with read-only metadata and the right scope', () => {
    const registry = new McpToolRegistry([
      new GetDataMartReportsTool({} as McpReportsFacade, publicOrigin),
    ]);

    expect(new GetDataMartReportsTool({} as McpReportsFacade, publicOrigin)).toMatchObject({
      name: 'get_data_mart_reports',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        reports: expect.any(Object),
      }),
      annotations: {
        title: 'Get Data Mart Reports',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('GetDataMartReportsTool');
    expect(registry.getTool('get_data_mart_reports')).toBeDefined();
  });
});
