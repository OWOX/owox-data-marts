import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_MANAGEMENT_FACADE,
  type McpDataMartManagementFacade,
} from '../../../../data-marts/facades/mcp-data-mart-management.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { DataMartToolMapper } from './data-mart-tool.mapper';
import { dataMartToolCall } from './data-mart-tool-error';
import { dataMartIdSchema } from './data-mart.schemas';

type Input = z.input<typeof dataMartIdSchema>;

@Injectable()
export class DeleteDataMartTool implements McpToolDefinition<Input> {
  readonly name = 'delete_data_mart';
  readonly description =
    'Delete a Data Mart and its Reports, schedules and relationships. Legacy Data Marts are also deleted in the legacy system. Warehouse tables remain. Present the result of get_data_mart_change_impact before deletion. Obtain user authorization before deletion.';
  readonly zodSchema = dataMartIdSchema;
  readonly outputSchema = { data_mart_id: z.string(), deleted: z.literal(true) };
  readonly annotations = {
    title: 'Delete Data Mart',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new DataMartToolMapper();

  constructor(
    @Inject(MCP_DATA_MART_MANAGEMENT_FACADE)
    private readonly dataMarts: McpDataMartManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = dataMartIdSchema.parse(input);
    const actor = this.mapper.toActor(context);
    await dataMartToolCall(() => this.dataMarts.delete(actor, parsed.data_mart_id));
    return jsonToolResult({ data_mart_id: parsed.data_mart_id, deleted: true });
  }
}
