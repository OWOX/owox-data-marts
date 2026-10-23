import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { dataMartTargetShape } from './data-mart-configuration.schemas';
const inputSchema = z.object({ ...dataMartTargetShape }).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class DeleteDataMartTool implements McpToolDefinition<Input> {
  readonly name = 'delete_data_mart';
  readonly description =
    'Delete a Data Mart using the existing API deletion rules and cleanup. This affects its reports and schedules. Requires editor or admin and permission to delete the Data Mart.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { data_mart_id: z.string(), status: z.literal('deleted') };
  readonly annotations = {
    title: 'Delete Data Mart',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    await this.facade.deleteDataMart(ctx, { dataMartId: parsed.data_mart_id });
    return jsonToolResult({ data_mart_id: parsed.data_mart_id, status: 'deleted' });
  }
}
