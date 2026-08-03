import type { McpScheduledTriggersFacade } from '../../../data-marts/facades/mcp-scheduled-triggers.facade';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { DeleteReportRunScheduleTool } from './delete-report-run-schedule.tool';

describe('DeleteReportRunScheduleTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['editor'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read', 'mcp:write'],
    authFlow: 'mcp',
  };
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;

  it('deletes the schedule and returns trigger_id, report_id, schedule: null', async () => {
    const facade = {
      deleteReportRunSchedule: jest
        .fn()
        .mockResolvedValue({ triggerId: 'trigger-1', reportId: 'report-1' }),
    } as unknown as jest.Mocked<McpScheduledTriggersFacade>;
    const tool = new DeleteReportRunScheduleTool(facade, publicOrigin);

    const expected = {
      trigger_id: 'trigger-1',
      report_id: 'report-1',
      schedules_url: 'https://app.owox.com/ui/project-1/data-marts/schedules',
      schedule: null,
    };

    await expect(tool.handler({ trigger_id: 'trigger-1' }, context)).resolves.toEqual({
      structuredContent: expected,
      content: [{ type: 'text', text: JSON.stringify(expected, null, 2) }],
    });

    expect(facade.deleteReportRunSchedule).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1', roles: ['editor'] },
      { triggerId: 'trigger-1' }
    );
  });

  it('handles null reportId in delete result', async () => {
    const facade = {
      deleteReportRunSchedule: jest
        .fn()
        .mockResolvedValue({ triggerId: 'trigger-2', reportId: null }),
    } as unknown as jest.Mocked<McpScheduledTriggersFacade>;
    const tool = new DeleteReportRunScheduleTool(facade, publicOrigin);

    const result = await tool.handler({ trigger_id: 'trigger-2' }, context);

    expect(result.structuredContent).toEqual({
      trigger_id: 'trigger-2',
      report_id: null,
      schedules_url: 'https://app.owox.com/ui/project-1/data-marts/schedules',
      schedule: null,
    });
  });

  it('rejects missing trigger_id, empty string, and unknown fields', () => {
    const tool = new DeleteReportRunScheduleTool({} as McpScheduledTriggersFacade, publicOrigin);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ trigger_id: '' })).toThrow();
    expect(() => tool.parseInput({ trigger_id: 't1', extra: true })).toThrow();
  });

  it('has correct metadata', () => {
    const tool = new DeleteReportRunScheduleTool({} as McpScheduledTriggersFacade, publicOrigin);

    expect(tool).toMatchObject({
      name: 'delete_report_run_schedule',
      requiredScopes: ['mcp:read', 'mcp:write'],
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    });
    expect(tool.description).toContain('trigger_id');
    expect(tool.description).toContain('left intact');
    expect(context.scopes).toEqual(tool.requiredScopes);
  });
});
