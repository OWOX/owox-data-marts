export const MCP_DATA_MART_EXECUTION_FACADE = Symbol('MCP_DATA_MART_EXECUTION_FACADE');

export interface McpDataMartExecutionContext {
  projectId: string;
  userId: string;
  roles: string[];
}
export interface McpDataMartRunInput {
  dataMartId: string;
  payload?: { runType?: 'INCREMENTAL' | 'MANUAL_BACKFILL'; data?: Record<string, unknown> };
}
export interface McpDataMartRunRef {
  dataMartId: string;
  runId: string;
}
export interface McpDataMartRunSummary extends McpDataMartRunRef {
  status: string;
  type: string;
  runType: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
  shouldPoll: boolean;
  backfill?: { chainId: string; segmentIndex: number; segmentsTotal: number };
}
export interface McpDataMartSchedule {
  dataMartId: string;
  triggerId: string;
  cronExpression: string;
  timeZone: string;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}
export interface McpCreateDataMartScheduleInput {
  dataMartId: string;
  cronExpression: string;
  timeZone: string;
  isActive: boolean;
}
export interface McpUpdateDataMartScheduleInput {
  dataMartId: string;
  triggerId: string;
  cronExpression: string;
  timeZone?: string;
  isActive?: boolean;
}
export interface McpDataMartExecutionFacade {
  run(
    ctx: McpDataMartExecutionContext,
    input: McpDataMartRunInput
  ): Promise<McpDataMartRunRef & { status: 'queued' }>;
  getRun(
    ctx: McpDataMartExecutionContext,
    input: McpDataMartRunRef
  ): Promise<McpDataMartRunSummary>;
  listRuns(
    ctx: McpDataMartExecutionContext,
    input: { dataMartId: string; limit: number; offset: number }
  ): Promise<McpDataMartRunSummary[]>;
  cancelRun(
    ctx: McpDataMartExecutionContext,
    input: McpDataMartRunRef
  ): Promise<McpDataMartRunRef & { cancellationApplied: true }>;
  listSchedules(
    ctx: McpDataMartExecutionContext,
    input: { dataMartId: string }
  ): Promise<McpDataMartSchedule[]>;
  createSchedule(
    ctx: McpDataMartExecutionContext,
    input: McpCreateDataMartScheduleInput
  ): Promise<McpDataMartSchedule>;
  updateSchedule(
    ctx: McpDataMartExecutionContext,
    input: McpUpdateDataMartScheduleInput
  ): Promise<McpDataMartSchedule>;
  deleteSchedule(
    ctx: McpDataMartExecutionContext,
    input: { dataMartId: string; triggerId: string }
  ): Promise<{ dataMartId: string; triggerId: string }>;
}
