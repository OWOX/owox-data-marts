import type { McpScheduledTriggersFacade } from '../../../data-marts/facades/mcp-scheduled-triggers.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { UpdateReportRunScheduleTool } from './update-report-run-schedule.tool';

describe('UpdateReportRunScheduleTool', () => {
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
    cronExpression: '0 10 * * 1',
    timeZone: 'Europe/Kyiv',
    isActive: false,
    nextRunAt: null,
  };

  it('updates a schedule by trigger_id and returns mapped result', async () => {
    const facade = {
      updateReportRunSchedule: jest.fn().mockResolvedValue(facadeResult),
    } as unknown as jest.Mocked<McpScheduledTriggersFacade>;
    const tool = new UpdateReportRunScheduleTool(facade);

    const expected = {
      trigger_id: 'trigger-1',
      report_id: 'report-1',
      cron_expression: '0 10 * * 1',
      time_zone: 'Europe/Kyiv',
      is_active: false,
      next_run_at: null,
    };

    await expect(
      tool.handler(
        {
          trigger_id: 'trigger-1',
          cron_expression: '0 10 * * 1',
          time_zone: 'Europe/Kyiv',
          is_active: false,
        },
        context
      )
    ).resolves.toEqual({
      structuredContent: expected,
      content: [{ type: 'text', text: JSON.stringify(expected, null, 2) }],
    });

    expect(facade.updateReportRunSchedule).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1', roles: ['editor'] },
      {
        triggerId: 'trigger-1',
        cronExpression: '0 10 * * 1',
        timeZone: 'Europe/Kyiv',
        isActive: false,
      }
    );
  });

  it('omits time_zone and is_active when they are not supplied', async () => {
    const facade = {
      updateReportRunSchedule: jest.fn().mockResolvedValue(facadeResult),
    } as unknown as jest.Mocked<McpScheduledTriggersFacade>;
    const tool = new UpdateReportRunScheduleTool(facade);

    await tool.handler({ trigger_id: 'trigger-1', cron_expression: '0 9 * * 1' }, context);

    expect(facade.updateReportRunSchedule).toHaveBeenCalledWith(expect.any(Object), {
      triggerId: 'trigger-1',
      cronExpression: '0 9 * * 1',
    });
  });

  it('rejects missing required fields and unknown fields', () => {
    const tool = new UpdateReportRunScheduleTool({} as McpScheduledTriggersFacade);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ trigger_id: 'trigger-1' })).toThrow();
    expect(() =>
      tool.parseInput({ trigger_id: 'trigger-1', cron_expression: '0 9 * * 1', unknown: true })
    ).toThrow();
    expect(() => tool.parseInput({ trigger_id: '', cron_expression: '0 9 * * 1' })).toThrow();
  });

  it('has update-only metadata', () => {
    const tool = new UpdateReportRunScheduleTool({} as McpScheduledTriggersFacade);

    expect(tool).toMatchObject({
      name: 'update_report_run_schedule',
      requiredScopes: ['mcp:write'],
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    });
    expect(tool.description).toContain('Updates one existing');
    expect(tool.description).toContain('trigger_id');
    expect(tool.description).toContain('keeps its current timezone');
    expect(tool.description).toContain('keeps its current active state');
    expect(tool.description).not.toContain('upsert');
  });
});
