import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  MCP_DATA_MART_MANAGEMENT_FACADE,
  type McpDataMartManagementFacade,
} from '../../../../data-marts/facades/mcp-data-mart-management.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { DataMartToolMapper } from './data-mart-tool.mapper';
import { dataMartToolCall } from './data-mart-tool-error';
import { updateDataMartDefinitionSchema, dataMartSummaryOutputSchema } from './data-mart.schemas';

type Input = z.input<typeof updateDataMartDefinitionSchema>;

@Injectable()
export class UpdateDataMartDefinitionTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_definition';
  readonly description =
    "Replace the Data Mart definition. Read get_data_mart_setup first. Review get_data_mart_change_impact before changing an existing source, explain the effect, and get the user's approval. SQL, Table, View and Table Pattern can switch between supported types. Switching to or from Connector requires a separate Data Mart.\n\nUse saved Credential IDs in connector configurations. Never use secret values. Preserve existing configuration _id and _credential_id. Read get_data_mart_setup before retrying. New connector configurations receive generated IDs.";
  readonly zodSchema = updateDataMartDefinitionSchema;
  readonly outputSchema = dataMartSummaryOutputSchema.shape;
  readonly annotations = {
    title: 'Update Data Mart Definition',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new DataMartToolMapper();

  constructor(
    @Inject(MCP_DATA_MART_MANAGEMENT_FACADE)
    private readonly dataMarts: McpDataMartManagementFacade,
    private readonly origin: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = updateDataMartDefinitionSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() =>
      this.dataMarts.updateDefinition(actor, parsed.data_mart_id, {
        definitionType: parsed.definition_type,
        definition: parsed.definition,
      })
    );
    return jsonToolResult(
      this.mapper.toSummary(result, context.projectId, this.origin.getPublicOrigin())
    );
  }
}
