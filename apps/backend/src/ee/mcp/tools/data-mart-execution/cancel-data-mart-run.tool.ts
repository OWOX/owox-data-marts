import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_EXECUTION_FACADE,
  type McpDataMartExecutionFacade,
} from '../../../../data-marts/facades/mcp-data-mart-execution.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { dataMartRunRefSchema } from './data-mart-execution.schemas';
import { DataMartExecutionToolMapper } from './data-mart-execution-tool.mapper';
import { dataMartExecutionToolCall } from './data-mart-execution-tool-error';

type Input = z.infer<typeof dataMartRunRefSchema>;
@Injectable()
export class CancelDataMartRunTool implements McpToolDefinition<Input> {
  readonly name = 'cancel_data_mart_run';
  readonly description =
    'Cancel a supported active Data Mart run under the OWOX cancellation rules. Cancelling any segment in a backfill chain stops its current active segment and remaining chain. Existing loaded data and usage remain. cancellation_applied confirms the operation. It does not describe the status of a completed segment selected for cancellation.';
  readonly zodSchema = dataMartRunRefSchema;
  readonly outputSchema = {
    data_mart_id: z.string(),
    run_id: z.string(),
    cancellation_applied: z.boolean(),
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  readonly annotations = {
    title: 'Cancel Data Mart Run',
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
    const parsed = dataMartRunRefSchema.parse(input);
    const result = await dataMartExecutionToolCall(() =>
      this.facade.cancelRun(this.mapper.toActor(context), {
        dataMartId: parsed.data_mart_id,
        runId: parsed.run_id,
      })
    );
    return jsonToolResult({
      data_mart_id: result.dataMartId,
      run_id: result.runId,
      cancellation_applied: result.cancellationApplied,
    });
  }
}
