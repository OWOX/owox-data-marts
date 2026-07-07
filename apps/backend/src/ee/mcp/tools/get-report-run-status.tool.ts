import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_REPORTS_FACADE,
  MCP_REPORT_RUN_STATUSES,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import { DataMartRunStatus } from '../../../data-marts/enums/data-mart-run-status.enum';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z
  .object({
    report_id: z.string().trim().min(1),
    run_id: z.string().trim().min(1),
  })
  .strict();

type GetReportRunStatusInput = z.infer<typeof inputSchema>;
type StopReason = 'queued_too_long' | 'running_too_long';
type PollingAdvice = {
  shouldPoll: boolean;
  stopReason: StopReason | null;
  message: string;
};

const RUN_LONGER_THAN_USUAL_MINUTES = 10;
const RUN_LIKELY_STUCK_MINUTES = 30;

const KEEP_POLLING_MESSAGE =
  'The report run has not finished yet — a "running" status is normal and expected, even after many checks, because report runs routinely take several minutes. Call get_report_run_status with the same report_id and run_id again: if you can wait between tool calls, wait up to 15 seconds; if you cannot wait, call it again right away rather than ending your reply. Do not stop polling on your own initiative, do not report a failure, and do not stop just to ask whether to continue (if the user explicitly asks you to stop, then stop) — only a terminal status ("success", "failed", "cancelled", "interrupted", or "restricted") ends the polling.';

@Injectable()
export class GetReportRunStatusTool implements McpToolDefinition<GetReportRunStatusInput> {
  readonly name = 'get_report_run_status';
  readonly description =
    'Get the current status of a report run started with run_report, identified by report_id and the run_id it returned. Report runs routinely take several minutes, so keep polling while should_poll is true and stop when should_poll is false; terminal statuses are "success", "failed", "cancelled", "interrupted", and "restricted". If you can wait between tool calls, poll about every 15 seconds; otherwise call again immediately. The message field tells you what to do next, including when to warn that a run is taking longer than usual and when to treat it as stuck and stop polling. stop_reason is set only when status is still "running" but should_poll is false, such as queued_too_long or running_too_long. queued_at is when the run was created; started_at is null until execution starts. raw_status exposes the backend status, and error is populated only for failed runs.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    run_id: z.string(),
    status: z.enum(MCP_REPORT_RUN_STATUSES),
    should_poll: z.boolean(),
    stop_reason: z.enum(['queued_too_long', 'running_too_long']).nullable(),
    queued_at: z.string().nullable(),
    started_at: z.string().nullable(),
    raw_status: z.nativeEnum(DataMartRunStatus),
    error: z.string().nullable(),
    message: z.string().nullable(),
  };
  readonly annotations = {
    title: 'Get Report Run Status',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade,
    private readonly systemTimeService: SystemTimeService
  ) {}

  parseInput(input: unknown): GetReportRunStatusInput {
    return inputSchema.parse(input);
  }

  async handler(input: GetReportRunStatusInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);

    const result = await this.reports.getReportRunStatus({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      reportId: parsed.report_id,
      runId: parsed.run_id,
    });
    const pollingAdvice =
      result.status === 'running'
        ? this.pollingAdvice(result.startedAt, result.queuedAt, result.rawStatus)
        : null;

    return jsonToolResult({
      report_id: result.reportId,
      run_id: result.runId,
      status: result.status,
      should_poll: pollingAdvice?.shouldPoll ?? false,
      stop_reason: pollingAdvice?.stopReason ?? null,
      queued_at: result.queuedAt,
      started_at: result.startedAt,
      raw_status: result.rawStatus,
      error: result.error,
      message: pollingAdvice?.message ?? null,
    });
  }

  private pollingAdvice(
    startedAt: string | null,
    queuedAt: string | null,
    rawStatus: DataMartRunStatus
  ): PollingAdvice {
    if (rawStatus === DataMartRunStatus.PENDING) {
      return this.pendingAdvice(queuedAt);
    }

    if (rawStatus === DataMartRunStatus.RUNNING && !startedAt) {
      return this.claimedWithoutStartAdvice(queuedAt);
    }

    return this.startedAdvice(startedAt);
  }

  private pendingAdvice(queuedAt: string | null): PollingAdvice {
    const queuedMinutes = this.elapsedMinutes(queuedAt);

    if (queuedMinutes !== null && queuedMinutes >= RUN_LIKELY_STUCK_MINUTES) {
      return this.stopAdvice(
        'queued_too_long',
        `This run has been queued for about ${queuedMinutes} minutes and may still execute when workers catch up.`
      );
    }

    if (queuedMinutes !== null && queuedMinutes >= RUN_LONGER_THAN_USUAL_MINUTES) {
      return {
        shouldPoll: true,
        stopReason: null,
        message: `This run has been queued for about ${queuedMinutes} minutes and may still execute when workers catch up. Let the user know it is taking longer than normal, and keep polling. ${KEEP_POLLING_MESSAGE}`,
      };
    }

    return this.keepPollingAdvice();
  }

  private claimedWithoutStartAdvice(queuedAt: string | null): PollingAdvice {
    const claimedWithoutStartMinutes = this.elapsedMinutes(queuedAt);

    if (
      claimedWithoutStartMinutes !== null &&
      claimedWithoutStartMinutes >= RUN_LIKELY_STUCK_MINUTES
    ) {
      return this.stopAdvice(
        'running_too_long',
        `This run was created about ${claimedWithoutStartMinutes} minutes ago and has been claimed by a worker, but execution has not recorded a start time.`
      );
    }

    if (
      claimedWithoutStartMinutes !== null &&
      claimedWithoutStartMinutes >= RUN_LONGER_THAN_USUAL_MINUTES
    ) {
      return {
        shouldPoll: true,
        stopReason: null,
        message: `This run was created about ${claimedWithoutStartMinutes} minutes ago and has been claimed by a worker, but execution has not recorded a start time — longer than usual. Let the user know it is taking longer than normal, and keep polling. ${KEEP_POLLING_MESSAGE}`,
      };
    }

    return this.keepPollingAdvice();
  }

  private startedAdvice(startedAt: string | null): PollingAdvice {
    const elapsedMinutes = this.elapsedMinutes(startedAt);

    if (elapsedMinutes !== null && elapsedMinutes >= RUN_LIKELY_STUCK_MINUTES) {
      return this.stopAdvice(
        'running_too_long',
        `This run has been in progress for about ${elapsedMinutes} minutes, which usually means it is stuck.`
      );
    }

    if (elapsedMinutes !== null && elapsedMinutes >= RUN_LONGER_THAN_USUAL_MINUTES) {
      return {
        shouldPoll: true,
        stopReason: null,
        message: `This run has been in progress for about ${elapsedMinutes} minutes — longer than usual. Let the user know it is taking longer than normal, and keep polling. ${KEEP_POLLING_MESSAGE}`,
      };
    }

    return this.keepPollingAdvice();
  }

  private keepPollingAdvice(): PollingAdvice {
    return {
      shouldPoll: true,
      stopReason: null,
      message: KEEP_POLLING_MESSAGE,
    };
  }

  private stopAdvice(stopReason: StopReason, detail: string): PollingAdvice {
    return {
      shouldPoll: false,
      stopReason,
      message: `${detail} Stop polling for now: give the user the report_id and run_id, say that the run may still execute, and suggest checking the report's Run History in OWOX Data Marts before starting another run.`,
    };
  }

  private elapsedMinutes(timestamp: string | null): number | null {
    if (!timestamp) {
      return null;
    }
    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return Math.max(0, Math.floor((this.systemTimeService.now().getTime() - parsed) / 60_000));
  }
}
