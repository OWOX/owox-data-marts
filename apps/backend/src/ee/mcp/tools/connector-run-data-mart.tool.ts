import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONNECTOR_RUN_FACADE,
  type McpConnectorRunFacade,
} from '../../../data-marts/facades/mcp-connector-run.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z.object({ data_mart_id: z.string().min(1) }).strict();
type RunConnectorDataMartInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorRunDataMartTool implements McpToolDefinition<RunConnectorDataMartInput> {
  readonly name = 'connector_run_data_mart';
  readonly description =
    'Start a manual run of a connector data mart (imports fresh data into its warehouse table). Returns the run id; poll connector_run_status to watch it. Fails if a run is already in progress.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { run_id: z.string(), status: z.string() };
  readonly annotations = {
    title: 'Connector Run Data Mart',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(@Inject(MCP_CONNECTOR_RUN_FACADE) private readonly run: McpConnectorRunFacade) {}

  parseInput(input: unknown): RunConnectorDataMartInput {
    return inputSchema.parse(input);
  }

  async handler(input: RunConnectorDataMartInput, context: McpAuthContext): Promise<McpToolResult> {
    const { data_mart_id } = this.parseInput(input);
    const result = await this.run.runConnectorDataMart({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      dataMartId: data_mart_id,
    });
    return jsonToolResult({ run_id: result.runId, status: result.status });
  }
}
