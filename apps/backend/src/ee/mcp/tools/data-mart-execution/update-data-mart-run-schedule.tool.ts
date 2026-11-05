import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_EXECUTION_FACADE,
  type McpDataMartExecutionFacade,
} from '../../../../data-marts/facades/mcp-data-mart-execution.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  updateDataMartRunScheduleSchema,
  scheduleOutputSchema,
} from './data-mart-execution.schemas';
import { DataMartExecutionToolMapper } from './data-mart-execution-tool.mapper';
import { dataMartExecutionToolCall } from './data-mart-execution-tool-error';

type Input = z.infer<typeof updateDataMartRunScheduleSchema>;
@Injectable()
export class UpdateDataMartRunScheduleTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_run_schedule';
  readonly description =
    'Update a specific run schedule for a connector Data Mart by data_mart_id and trigger_id. Supply cron_expression. If time_zone or is_active is omitted, its saved value remains. The tool does not modify Report or Data Quality schedules. Each update of an active schedule recalculates the next run time. Read the schedule before retrying.';
  readonly zodSchema = updateDataMartRunScheduleSchema;
  readonly outputSchema = scheduleOutputSchema;
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  readonly annotations = {
    title: 'Update Data Mart Run Schedule',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  };
  private readonly mapper = new DataMartExecutionToolMapper();
  constructor(
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly facade: McpDataMartExecutionFacade
  ) {}
  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = updateDataMartRunScheduleSchema.parse(input);
    const result = await dataMartExecutionToolCall(() =>
      this.facade.updateSchedule(this.mapper.toActor(context), {
        dataMartId: parsed.data_mart_id,
        triggerId: parsed.trigger_id,
        cronExpression: parsed.cron_expression,
        ...(parsed.time_zone !== undefined ? { timeZone: parsed.time_zone } : {}),
        ...(parsed.is_active !== undefined ? { isActive: parsed.is_active } : {}),
      })
    );
    return jsonToolResult(this.mapper.toSchedule(result));
  }
}
