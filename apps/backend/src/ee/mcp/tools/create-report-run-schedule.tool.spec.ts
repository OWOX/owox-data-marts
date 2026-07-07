import type { McpScheduledTriggersFacade } from '../../../data-marts/facades/mcp-scheduled-triggers.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { CreateReportRunScheduleTool } from './create-report-run-schedule.tool';

describe('CreateReportRunScheduleTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['editor'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read', 'mcp:write'],
    authFlow: 'mcp',
  };

  const facadeResult = {
    triggerId: 'trigger-1',
    reportId: 'report-1',
    cronExpression: '0 9 * * 1',
    timeZone: 'UTC',
    isActive: true,
    nextRunAt: '2026-07-07T09:00:00.000Z',
  };

  it('creates a new schedule and returns mapped result', async () => {
    const facade = {
      createReportRunSchedule: jest.fn().mockResolvedValue(facadeResult),
    } as unknown as jest.Mocked<McpScheduledTriggersFacade>;
    const tool = new CreateReportRunScheduleTool(facade);

    const expected = {
      trigger_id: 'trigger-1',
      report_id: 'report-1',
      cron_expression: '0 9 * * 1',
      time_zone: 'UTC',
      is_active: true,
      next_run_at: '2026-07-07T09:00:00.000Z',
    };

    await expect(
      tool.handler({ report_id: 'report-1', cron_expression: '0 9 * * 1' }, context)
    ).resolves.toEqual({
      structuredContent: expected,
      content: [{ type: 'text', text: JSON.stringify(expected, null, 2) }],
    });

    expect(facade.createReportRunSchedule).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1', roles: ['editor'] },
      { reportId: 'report-1', cronExpression: '0 9 * * 1', timeZone: 'UTC', isActive: true }
    );
  });

  it('forwards explicit time_zone and is_active to the facade', async () => {
    const facade = {
      createReportRunSchedule: jest.fn().mockResolvedValue(facadeResult),
    } as unknown as jest.Mocked<McpScheduledTriggersFacade>;
    const tool = new CreateReportRunScheduleTool(facade);

    await tool.handler(
      {
        report_id: 'report-1',
        cron_expression: '0 9 * * 1',
        time_zone: 'Europe/Kyiv',
        is_active: false,
      },
      context
    );

    expect(facade.createReportRunSchedule).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ timeZone: 'Europe/Kyiv', isActive: false })
    );
  });

  it('rejects missing required fields and unknown fields', () => {
    const tool = new CreateReportRunScheduleTool({} as McpScheduledTriggersFacade);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ report_id: 'r1' })).toThrow();
    expect(() =>
      tool.parseInput({ report_id: 'r1', cron_expression: '0 9 * * 1', unknown: true })
    ).toThrow();
    expect(() => tool.parseInput({ report_id: '', cron_expression: '0 9 * * 1' })).toThrow();
  });

  it('has create-only metadata', () => {
    const tool = new CreateReportRunScheduleTool({} as McpScheduledTriggersFacade);

    expect(tool).toMatchObject({
      name: 'create_report_run_schedule',
      requiredScopes: ['mcp:read', 'mcp:write'],
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    });
    expect(tool.description).toContain('Creates a new');
    expect(tool.description).toContain('does not replace');
    expect(tool.description).not.toContain('upsert');
  });
});
