import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONNECTOR_RUN_FACADE,
  type McpConnectorRunFacade,
} from '../../../data-marts/facades/mcp-connector-run.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z
  .object({ data_mart_id: z.string().min(1), run_id: z.string().min(1) })
  .strict();
type ConnectorRunStatusInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorRunStatusTool implements McpToolDefinition<ConnectorRunStatusInput> {
  readonly name = 'connector_run_status';
  readonly description =
    'Get the status of a connector data mart run, including timing, recent log lines, and any errors.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    run_id: z.string(),
    data_mart_id: z.string(),
    status: z.string(),
    run_type: z.string(),
    started_at: z.string().nullable(),
    finished_at: z.string().nullable(),
    last_logs: z.array(z.string()),
    errors: z.array(z.string()),
  };
  readonly annotations = {
    title: 'Connector Run Status',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(@Inject(MCP_CONNECTOR_RUN_FACADE) private readonly run: McpConnectorRunFacade) {}

  parseInput(input: unknown): ConnectorRunStatusInput {
    return inputSchema.parse(input);
  }

  async handler(input: ConnectorRunStatusInput, context: McpAuthContext): Promise<McpToolResult> {
    const { data_mart_id, run_id } = this.parseInput(input);
    const result = await this.run.getConnectorRunStatus({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      dataMartId: data_mart_id,
      runId: run_id,
    });
    return jsonToolResult({
      run_id: result.runId,
      data_mart_id: result.dataMartId,
      status: result.status,
      run_type: result.runType,
      started_at: result.startedAt,
      finished_at: result.finishedAt,
      last_logs: result.lastLogs,
      errors: result.errors,
    });
  }
}
