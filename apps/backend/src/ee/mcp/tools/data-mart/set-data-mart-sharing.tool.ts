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
import { setDataMartSharingSchema } from './data-mart.schemas';

type Input = z.input<typeof setDataMartSharingSchema>;

@Injectable()
export class SetDataMartSharingTool implements McpToolDefinition<Input> {
  readonly name = 'set_data_mart_sharing';
  readonly description =
    'Set availability for reporting and maintenance. The tool requires permission to configure Data Mart sharing, as in OWOX. Both flags are required. This may remove your own access.';
  readonly zodSchema = setDataMartSharingSchema;
  readonly outputSchema = { data_mart_id: z.string(), updated: z.literal(true) };
  readonly annotations = {
    title: 'Set Data Mart Sharing',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new DataMartToolMapper();

  constructor(
    @Inject(MCP_DATA_MART_MANAGEMENT_FACADE)
    private readonly dataMarts: McpDataMartManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = setDataMartSharingSchema.parse(input);
    const actor = this.mapper.toActor(context);
    await dataMartToolCall(() =>
      this.dataMarts.setSharing(
        actor,
        parsed.data_mart_id,
        parsed.available_for_reporting,
        parsed.available_for_maintenance
      )
    );
    return jsonToolResult({ data_mart_id: parsed.data_mart_id, updated: true });
  }
}
