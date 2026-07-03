export const MCP_SCHEDULED_TRIGGERS_FACADE = Symbol('MCP_SCHEDULED_TRIGGERS_FACADE');

export interface McpScheduledTriggersContext {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpReportRunScheduleItem {
  triggerId: string;
  report: { id: string; title: string };
  dataMart: { id: string; title: string };
  cronExpression: string;
  timeZone: string;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

export interface McpReportRunScheduleResult {
  triggerId: string;
  reportId: string;
  cronExpression: string;
  timeZone: string;
  isActive: boolean;
  nextRunAt: string | null;
}

export interface McpScheduledTriggersFacade {
  listReportRunSchedules(ctx: McpScheduledTriggersContext): Promise<McpReportRunScheduleItem[]>;
  createReportRunSchedule(
    ctx: McpScheduledTriggersContext,
    input: { reportId: string; cronExpression: string; timeZone: string; isActive: boolean }
  ): Promise<McpReportRunScheduleResult>;
  updateReportRunSchedule(
    ctx: McpScheduledTriggersContext,
    input: { triggerId: string; cronExpression: string; timeZone?: string; isActive?: boolean }
  ): Promise<McpReportRunScheduleResult>;
  deleteReportRunSchedule(
    ctx: McpScheduledTriggersContext,
    input: { triggerId: string }
  ): Promise<{ triggerId: string; reportId: string | null }>;
}
