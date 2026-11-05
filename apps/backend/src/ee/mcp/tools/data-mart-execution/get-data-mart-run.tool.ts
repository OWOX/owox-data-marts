import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_EXECUTION_FACADE,
  type McpDataMartExecutionFacade,
} from '../../../../data-marts/facades/mcp-data-mart-execution.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { dataMartRunRefSchema, runOutputSchema } from './data-mart-execution.schemas';
import { DataMartExecutionToolMapper } from './data-mart-execution-tool.mapper';
import { dataMartExecutionToolCall } from './data-mart-execution-tool-error';

type Input = z.infer<typeof dataMartRunRefSchema>;
@Injectable()
export class GetDataMartRunTool implements McpToolDefinition<Input> {
  readonly name = 'get_data_mart_run';
  readonly description =
    'Read the status and timestamps of a Data Mart run. The result excludes run logs, provider errors, and saved definitions. should_poll applies only to this run segment.\n\nWhen backfill metadata is present, use list_data_mart_runs to find later segments with the same chain_id. Use offset to read further pages. One segment with status SUCCESS does not mean that the complete backfill succeeded. A successful run alone does not prove data readiness for a later query.';
  readonly zodSchema = dataMartRunRefSchema;
  readonly outputSchema = runOutputSchema;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  readonly annotations = {
    title: 'Get Data Mart Run',
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
    const parsed = dataMartRunRefSchema.parse(input);
    const result = await dataMartExecutionToolCall(() =>
      this.facade.getRun(this.mapper.toActor(context), {
        dataMartId: parsed.data_mart_id,
        runId: parsed.run_id,
      })
    );
    return jsonToolResult(this.mapper.toRun(result));
  }
}
