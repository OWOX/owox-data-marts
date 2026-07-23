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
  })
  .strict();

type DeleteReportRunScheduleInput = z.infer<typeof inputSchema>;

@Injectable()
export class DeleteReportRunScheduleTool implements McpToolDefinition<DeleteReportRunScheduleInput> {
  readonly name = 'delete_report_run_schedule';
  readonly description =
    'Removes the single report run schedule identified by trigger_id (get it from list_report_run_schedules). Only that schedule is removed — the Report and any other schedules it may have are left intact. The response echoes the removed trigger_id and report_id with schedule: null to confirm that specific schedule is gone; check list_report_run_schedules if you need to know whether other schedules remain.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    trigger_id: z.string(),
    report_id: z.string().nullable(),
    schedules_url: z.string().describe('Open report schedules in OWOX.'),
    schedule: z.null(),
  };
  readonly annotations = {
    title: 'Delete Report Run Schedule',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];

  constructor(
    @Inject(MCP_SCHEDULED_TRIGGERS_FACADE)
    private readonly facade: McpScheduledTriggersFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): DeleteReportRunScheduleInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: DeleteReportRunScheduleInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };

    const result = await this.facade.deleteReportRunSchedule(ctx, {
      triggerId: parsed.trigger_id,
    });

    const structuredContent = {
      trigger_id: result.triggerId,
      report_id: result.reportId,
      schedules_url: joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildReportSchedulesUiPath(context.projectId)
      ),
      schedule: null,
    };

    return jsonToolResult(structuredContent);
  }
}
