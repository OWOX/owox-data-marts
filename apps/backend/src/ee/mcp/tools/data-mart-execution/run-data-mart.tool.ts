import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_EXECUTION_FACADE,
  type McpDataMartExecutionFacade,
} from '../../../../data-marts/facades/mcp-data-mart-execution.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { runDataMartSchema } from './data-mart-execution.schemas';
import { DataMartExecutionToolMapper } from './data-mart-execution-tool.mapper';
import { dataMartExecutionToolCall } from './data-mart-execution-tool-error';

type Input = z.infer<typeof runDataMartSchema>;
@Injectable()
export class RunDataMartTool implements McpToolDefinition<Input> {
  readonly name = 'run_data_mart';
  readonly description =
    'Queue a connector Data Mart run with the same options as a manual run in OWOX. Only published connector Data Marts can run. Each call can load data and incur usage. Check run history before retrying. The tool returns queued status, which does not confirm completion or data readiness.\n\nPoll get_data_mart_run by run_id, waiting up to 15 seconds between checks. For backfills with multiple segments, follow backfill.chain_id through list_data_mart_runs. The returned run_id identifies the first segment only.\n\nOmit payload for incremental runs. For bundled connectors, use payload.data fields marked MANUAL_BACKFILL in get_connector_specification. For custom connectors, read the selected manifest with get_custom_connector_version. Use YYYY-MM-DD for StartDate and EndDate when the connector declares them. For the complete workflow, call get_guide with topic data_mart_runs.';
  readonly zodSchema = runDataMartSchema;
  readonly outputSchema = {
    data_mart_id: z.string(),
    run_id: z.string(),
    status: z.literal('queued'),
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  readonly annotations = {
    title: 'Run Data Mart',
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
    const parsed = runDataMartSchema.parse(input);
    const result = await dataMartExecutionToolCall(() =>
      this.facade.run(this.mapper.toActor(context), {
        dataMartId: parsed.data_mart_id,
        ...(parsed.payload !== undefined ? { payload: parsed.payload } : {}),
      })
    );
    return jsonToolResult({
      data_mart_id: result.dataMartId,
      run_id: result.runId,
      status: result.status,
    });
  }
}
