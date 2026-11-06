import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_EXECUTION_FACADE,
  type McpDataMartExecutionFacade,
} from '../../../../data-marts/facades/mcp-data-mart-execution.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { listDataMartRunsSchema, runOutputSchema } from './data-mart-execution.schemas';
import { DataMartExecutionToolMapper } from './data-mart-execution-tool.mapper';
import { dataMartExecutionToolCall } from './data-mart-execution-tool-error';

type Input = z.infer<typeof listDataMartRunsSchema>;
@Injectable()
export class ListDataMartRunsTool implements McpToolDefinition<Input> {
  readonly name = 'list_data_mart_runs';
  readonly description =
    'List a page of Data Mart run history with safe status and timestamps. Use limit and offset to read further pages. Group backfill segments by backfill.chain_id. Follow later segment_index values. Segment status does not describe the outcome of the complete chain. The result excludes logs, provider diagnostics, and credentials.';
  readonly zodSchema = listDataMartRunsSchema;
  readonly outputSchema = { runs: z.array(z.object(runOutputSchema)) };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  readonly annotations = {
    title: 'List Data Mart Runs',
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
    const parsed = listDataMartRunsSchema.parse(input);
    const result = await dataMartExecutionToolCall(() =>
      this.facade.listRuns(this.mapper.toActor(context), {
        dataMartId: parsed.data_mart_id,
        limit: parsed.limit,
        offset: parsed.offset,
      })
    );
    return jsonToolResult({ runs: result.map(run => this.mapper.toRun(run)) });
  }
}
