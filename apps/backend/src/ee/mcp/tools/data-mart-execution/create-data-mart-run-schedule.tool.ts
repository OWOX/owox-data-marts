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
  createDataMartRunScheduleSchema,
  scheduleOutputSchema,
} from './data-mart-execution.schemas';
import { DataMartExecutionToolMapper } from './data-mart-execution-tool.mapper';
import { dataMartExecutionToolCall } from './data-mart-execution-tool-error';

type Input = z.infer<typeof createDataMartRunScheduleSchema>;
@Injectable()
export class CreateDataMartRunScheduleTool implements McpToolDefinition<Input> {
  readonly name = 'create_data_mart_run_schedule';
  readonly description =
    'Create an additional recurring run schedule for a connector Data Mart. The Data Mart must be published. Use a cron expression and an IANA timezone. The timezone defaults to UTC, and is_active defaults to true. This does not replace existing schedules. Scheduled runs can load data and incur usage.';
  readonly zodSchema = createDataMartRunScheduleSchema;
  readonly outputSchema = scheduleOutputSchema;
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  readonly annotations = {
    title: 'Create Data Mart Run Schedule',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };
  private readonly mapper = new DataMartExecutionToolMapper();
  constructor(
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly facade: McpDataMartExecutionFacade
  ) {}
  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = createDataMartRunScheduleSchema.parse(input);
    const result = await dataMartExecutionToolCall(() =>
      this.facade.createSchedule(this.mapper.toActor(context), {
        dataMartId: parsed.data_mart_id,
        cronExpression: parsed.cron_expression,
        timeZone: parsed.time_zone,
        isActive: parsed.is_active,
      })
    );
    return jsonToolResult(this.mapper.toSchedule(result));
  }
}
