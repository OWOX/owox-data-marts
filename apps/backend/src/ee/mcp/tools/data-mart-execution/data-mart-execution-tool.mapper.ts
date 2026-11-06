import type {
  McpDataMartRunSummary,
  McpDataMartSchedule,
} from '../../../../data-marts/facades/mcp-data-mart-execution.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
export class DataMartExecutionToolMapper {
  toActor(context: McpAuthContext) {
    return { projectId: context.projectId, userId: context.userId, roles: context.roles };
  }
  toRun(run: McpDataMartRunSummary) {
    return {
      data_mart_id: run.dataMartId,
      run_id: run.runId,
      status: run.status,
      type: run.type,
      run_type: run.runType,
      created_at: run.createdAt,
      started_at: run.startedAt,
      finished_at: run.finishedAt,
      error_summary: run.errorSummary,
      should_poll: run.shouldPoll,
      ...(run.backfill
        ? {
            backfill: {
              chain_id: run.backfill.chainId,
              segment_index: run.backfill.segmentIndex,
              segments_total: run.backfill.segmentsTotal,
            },
          }
        : {}),
    };
  }
  toSchedule(schedule: McpDataMartSchedule) {
    return {
      data_mart_id: schedule.dataMartId,
      trigger_id: schedule.triggerId,
      cron_expression: schedule.cronExpression,
      time_zone: schedule.timeZone,
      is_active: schedule.isActive,
      next_run_at: schedule.nextRunAt,
      last_run_at: schedule.lastRunAt,
    };
  }
}
