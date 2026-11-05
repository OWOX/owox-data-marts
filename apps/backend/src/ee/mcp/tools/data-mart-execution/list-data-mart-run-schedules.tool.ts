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
  listDataMartRunSchedulesSchema,
  scheduleOutputSchema,
} from './data-mart-execution.schemas';
import { DataMartExecutionToolMapper } from './data-mart-execution-tool.mapper';
import { dataMartExecutionToolCall } from './data-mart-execution-tool-error';

type Input = z.infer<typeof listDataMartRunSchedulesSchema>;
@Injectable()
export class ListDataMartRunSchedulesTool implements McpToolDefinition<Input> {
  readonly name = 'list_data_mart_run_schedules';
  readonly description =
    'List recurring connector run schedules for one Data Mart. Report and Data Quality schedules are excluded. Use the returned trigger_id to edit or delete that specific schedule.';
  readonly zodSchema = listDataMartRunSchedulesSchema;
  readonly outputSchema = { schedules: z.array(z.object(scheduleOutputSchema)) };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  readonly annotations = {
    title: 'List Data Mart Run Schedules',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  private readonly mapper = new DataMartExecutionToolMapper();
  constructor(
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly facade: McpDataMartExecutionFacade
  ) {}
  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = listDataMartRunSchedulesSchema.parse(input);
    const result = await dataMartExecutionToolCall(() =>
      this.facade.listSchedules(this.mapper.toActor(context), { dataMartId: parsed.data_mart_id })
    );
    return jsonToolResult({ schedules: result.map(schedule => this.mapper.toSchedule(schedule)) });
  }
}
