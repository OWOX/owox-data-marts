import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_SCHEDULED_TRIGGERS_FACADE,
  type McpScheduledTriggersFacade,
} from '../../../data-marts/facades/mcp-scheduled-triggers.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z.object({}).strict();

type ListReportRunSchedulesInput = z.infer<typeof inputSchema>;

@Injectable()
export class ListReportRunSchedulesTool implements McpToolDefinition<ListReportRunSchedulesInput> {
  readonly name = 'list_report_run_schedules';
  readonly description =
    'Lists every scheduled REPORT_RUN trigger (report run schedule) in the current OWOX project that the current MCP user can see, in a single response. Each item includes trigger_id — pass it to update_report_run_schedule to modify that specific schedule or delete_report_run_schedule to remove it — plus the report and data mart it belongs to. To add another schedule for a report, call create_report_run_schedule; creating never replaces existing schedules.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    schedules: z.array(
      z.object({
        trigger_id: z.string(),
        report: z.object({ id: z.string(), title: z.string() }),
        data_mart: z.object({ id: z.string(), title: z.string() }),
        cron_expression: z.string(),
        time_zone: z.string(),
        is_active: z.boolean(),
        next_run_at: z.string().nullable(),
        last_run_at: z.string().nullable(),
        can_edit: z.boolean(),
        can_delete: z.boolean(),
      })
    ),
  };
  readonly annotations = {
    title: 'List Report Run Schedules',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_SCHEDULED_TRIGGERS_FACADE)
    private readonly facade: McpScheduledTriggersFacade
  ) {}

  parseInput(input: unknown): ListReportRunSchedulesInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: ListReportRunSchedulesInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };

    const items = await this.facade.listReportRunSchedules(ctx);

    const structuredContent = {
      schedules: items.map(item => ({
        trigger_id: item.triggerId,
        report: item.report,
        data_mart: item.dataMart,
        cron_expression: item.cronExpression,
        time_zone: item.timeZone,
        is_active: item.isActive,
        next_run_at: item.nextRunAt,
        last_run_at: item.lastRunAt,
        can_edit: item.canEdit,
        can_delete: item.canDelete,
      })),
    };

    return jsonToolResult(structuredContent);
  }
}
