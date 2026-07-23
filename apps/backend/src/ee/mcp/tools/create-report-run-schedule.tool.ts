import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_SCHEDULED_TRIGGERS_FACADE,
  type McpScheduledTriggersFacade,
} from '../../../data-marts/facades/mcp-scheduled-triggers.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildReportSchedulesUiPath } from './data-mart-ui-path';
import { joinPublicOrigin } from './mcp-public-url.util';

const DEFAULT_TIME_ZONE = 'UTC';

const inputSchema = z
  .object({
    report_id: z.string().trim().min(1),
    cron_expression: z.string().trim().min(1),
    time_zone: z.string().trim().min(1).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

type CreateReportRunScheduleInput = z.infer<typeof inputSchema>;

@Injectable()
export class CreateReportRunScheduleTool implements McpToolDefinition<CreateReportRunScheduleInput> {
  readonly name = 'create_report_run_schedule';
  readonly description =
    'Creates a new recurring run schedule for a report. Translate the user\'s natural-language schedule ("every Monday at 9am", "daily at midnight") into a standard 5-field cron expression before calling (e.g. "0 9 * * 1"). This creates an additional schedule and does not replace, delete, or update existing schedules for the same report. To change an existing schedule, first call list_report_run_schedules and then call update_report_run_schedule with the specific trigger_id. time_zone must be a valid IANA timezone (e.g. "Europe/Kyiv"); if the user does not specify one, default to UTC and confirm with them. is_active defaults to true.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    trigger_id: z.string(),
    report_id: z.string(),
    schedules_url: z.string().describe('Open report schedules in OWOX.'),
    cron_expression: z.string(),
    time_zone: z.string(),
    is_active: z.boolean(),
    next_run_at: z.string().nullable(),
  };
  readonly annotations = {
    title: 'Create Report Run Schedule',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];

  constructor(
    @Inject(MCP_SCHEDULED_TRIGGERS_FACADE)
    private readonly facade: McpScheduledTriggersFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): CreateReportRunScheduleInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: CreateReportRunScheduleInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };

    const result = await this.facade.createReportRunSchedule(ctx, {
      reportId: parsed.report_id,
      cronExpression: parsed.cron_expression,
      timeZone: parsed.time_zone ?? DEFAULT_TIME_ZONE,
      isActive: parsed.is_active ?? true,
    });

    return jsonToolResult({
      trigger_id: result.triggerId,
      report_id: result.reportId,
      schedules_url: joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildReportSchedulesUiPath(context.projectId)
      ),
      cron_expression: result.cronExpression,
      time_zone: result.timeZone,
      is_active: result.isActive,
      next_run_at: result.nextRunAt,
    });
  }
}
