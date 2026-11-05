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
import { setDataMartOwnersSchema } from './data-mart.schemas';

type Input = z.input<typeof setDataMartOwnersSchema>;

@Injectable()
export class SetDataMartOwnersTool implements McpToolDefinition<Input> {
  readonly name = 'set_data_mart_owners';
  readonly description =
    'Replace both business and technical owner lists. Read the current setup first. Use list_project_members to select project members. The tool requires the same permission to manage owners as OWOX. This may remove your own access.';
  readonly zodSchema = setDataMartOwnersSchema;
  readonly outputSchema = { data_mart_id: z.string(), updated: z.literal(true) };
  readonly annotations = {
    title: 'Set Data Mart Owners',
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
    const parsed = setDataMartOwnersSchema.parse(input);
    const actor = this.mapper.toActor(context);
    await dataMartToolCall(() =>
      this.dataMarts.setOwners(
        actor,
        parsed.data_mart_id,
        parsed.business_owner_ids,
        parsed.technical_owner_ids
      )
    );
    return jsonToolResult({ data_mart_id: parsed.data_mart_id, updated: true });
  }
}
