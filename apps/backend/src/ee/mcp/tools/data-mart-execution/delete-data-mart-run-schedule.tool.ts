import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_EXECUTION_FACADE,
  type McpDataMartExecutionFacade,
} from '../../../../data-marts/facades/mcp-data-mart-execution.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { deleteDataMartRunScheduleSchema } from './data-mart-execution.schemas';
import { DataMartExecutionToolMapper } from './data-mart-execution-tool.mapper';
import { dataMartExecutionToolCall } from './data-mart-execution-tool-error';

type Input = z.infer<typeof deleteDataMartRunScheduleSchema>;
@Injectable()
export class DeleteDataMartRunScheduleTool implements McpToolDefinition<Input> {
  readonly name = 'delete_data_mart_run_schedule';
  readonly description =
    "Delete a specific run schedule for a connector Data Mart by data_mart_id and trigger_id. This stops future runs for that schedule. Existing runs and other schedules remain. The tool does not modify Report or Data Quality schedules. Get the user's approval before the call.";
  readonly zodSchema = deleteDataMartRunScheduleSchema;
  readonly outputSchema = { data_mart_id: z.string(), trigger_id: z.string() };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  readonly annotations = {
    title: 'Delete Data Mart Run Schedule',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  };
  private readonly mapper = new DataMartExecutionToolMapper();
  constructor(
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly facade: McpDataMartExecutionFacade
  ) {}
  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = deleteDataMartRunScheduleSchema.parse(input);
    const result = await dataMartExecutionToolCall(() =>
      this.facade.deleteSchedule(this.mapper.toActor(context), {
        dataMartId: parsed.data_mart_id,
        triggerId: parsed.trigger_id,
      })
    );
    return jsonToolResult({ data_mart_id: result.dataMartId, trigger_id: result.triggerId });
  }
}
