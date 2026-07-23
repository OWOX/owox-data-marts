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

const inputSchema = z
  .object({
    trigger_id: z.string().trim().min(1),
    cron_expression: z.string().trim().min(1),
    time_zone: z.string().trim().min(1).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

type UpdateReportRunScheduleInput = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateReportRunScheduleTool implements McpToolDefinition<UpdateReportRunScheduleInput> {
  readonly name = 'update_report_run_schedule';
  readonly description =
    'Updates one existing report run schedule identified by trigger_id (get it from list_report_run_schedules). This changes cron_expression, and optionally time_zone and is_active; it does not change the report target and does not create another schedule. To add another schedule for the same report, call create_report_run_schedule instead. time_zone must be a valid IANA timezone (e.g. "Europe/Kyiv"); if omitted, the schedule keeps its current timezone. If is_active is omitted, the schedule keeps its current active state.';
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
    title: 'Update Report Run Schedule',
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

  parseInput(input: unknown): UpdateReportRunScheduleInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: UpdateReportRunScheduleInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };

    const result = await this.facade.updateReportRunSchedule(ctx, {
      triggerId: parsed.trigger_id,
      cronExpression: parsed.cron_expression,
      ...(parsed.time_zone !== undefined ? { timeZone: parsed.time_zone } : {}),
      ...(parsed.is_active !== undefined ? { isActive: parsed.is_active } : {}),
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
