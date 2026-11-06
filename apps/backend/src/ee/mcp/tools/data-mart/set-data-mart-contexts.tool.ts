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
import { setDataMartContextsSchema } from './data-mart.schemas';

type Input = z.input<typeof setDataMartContextsSchema>;

@Injectable()
export class SetDataMartContextsTool implements McpToolDefinition<Input> {
  readonly name = 'set_data_mart_contexts';
  readonly description =
    'Replace the Context assignments of a Data Mart. An empty list removes all assignments. The tool requires the same sharing permission as OWOX. This can change who can access the Data Mart.';
  readonly zodSchema = setDataMartContextsSchema;
  readonly outputSchema = { data_mart_id: z.string(), updated: z.literal(true) };
  readonly annotations = {
    title: 'Set Data Mart Contexts',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new DataMartToolMapper();

  constructor(
    @Inject(MCP_DATA_MART_MANAGEMENT_FACADE)
    private readonly dataMarts: McpDataMartManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = setDataMartContextsSchema.parse(input);
    const actor = this.mapper.toActor(context);
    await dataMartToolCall(() =>
      this.dataMarts.setContexts(actor, parsed.data_mart_id, parsed.context_ids)
    );
    return jsonToolResult({ data_mart_id: parsed.data_mart_id, updated: true });
  }
}
