import type { McpScheduledTriggersFacade } from '../../../data-marts/facades/mcp-scheduled-triggers.facade';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { ListReportRunSchedulesTool } from './list-report-run-schedules.tool';

describe('ListReportRunSchedulesTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['editor'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;

  const scheduleItem = {
    triggerId: 'trigger-1',
    report: { id: 'report-1', title: 'Weekly Sales' },
    dataMart: { id: 'dm-1', title: 'Sales DM' },
    cronExpression: '0 9 * * 1',
    timeZone: 'Europe/Kyiv',
    isActive: true,
    nextRunAt: '2026-07-07T06:00:00.000Z',
    lastRunAt: null,
    canEdit: true,
    canDelete: true,
  };

  it('returns mapped schedule list from the facade', async () => {
    const facade = {
      listReportRunSchedules: jest.fn().mockResolvedValue([scheduleItem]),
    } as unknown as jest.Mocked<McpScheduledTriggersFacade>;
    const tool = new ListReportRunSchedulesTool(facade, publicOrigin);

    const expected = {
      schedules: [
        {
          trigger_id: 'trigger-1',
          report: {
            id: 'report-1',
            title: 'Weekly Sales',
            url: 'https://app.owox.com/ui/project-1/data-marts/dm-1/reports',
          },
          data_mart: {
            id: 'dm-1',
            title: 'Sales DM',
            url: 'https://app.owox.com/ui/project-1/data-marts/dm-1/data-setup',
          },
          schedules_url: 'https://app.owox.com/ui/project-1/data-marts/schedules',
          cron_expression: '0 9 * * 1',
          time_zone: 'Europe/Kyiv',
          is_active: true,
          next_run_at: '2026-07-07T06:00:00.000Z',
          last_run_at: null,
          can_edit: true,
          can_delete: true,
        },
      ],
    };

    await expect(tool.handler({}, context)).resolves.toEqual({
      structuredContent: expected,
      content: [{ type: 'text', text: JSON.stringify(expected, null, 2) }],
    });

    expect(facade.listReportRunSchedules).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
    });
  });

  it('accepts empty input and rejects any fields', () => {
    const tool = new ListReportRunSchedulesTool({} as McpScheduledTriggersFacade, publicOrigin);

    expect(() => tool.parseInput({})).not.toThrow();
    expect(() => tool.parseInput({ project_id: 'x' })).toThrow();
    expect(() => tool.parseInput({ limit: 10 })).toThrow();
    expect(() => tool.parseInput({ offset: 0 })).toThrow();
  });

  it('has correct metadata', () => {
    const tool = new ListReportRunSchedulesTool({} as McpScheduledTriggersFacade, publicOrigin);

    expect(tool).toMatchObject({
      name: 'list_report_run_schedules',
      requiredScopes: ['mcp:read'],
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    });
    expect(tool.description).toContain('trigger_id');
    expect(tool.description).toContain('REPORT_RUN');
    expect(tool.description).toContain('create_report_run_schedule');
    expect(tool.description).toContain('update_report_run_schedule');
  });
});
