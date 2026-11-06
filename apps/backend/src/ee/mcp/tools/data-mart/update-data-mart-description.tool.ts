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
import { updateDataMartDescriptionSchema, dataMartSummaryOutputSchema } from './data-mart.schemas';

type Input = z.input<typeof updateDataMartDescriptionSchema>;

@Injectable()
export class UpdateDataMartDescriptionTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_description';
  readonly description =
    'Replace the Markdown description of a Data Mart. An empty string clears it.';
  readonly zodSchema = updateDataMartDescriptionSchema;
  readonly outputSchema = dataMartSummaryOutputSchema.shape;
  readonly annotations = {
    title: 'Update Data Mart Description',
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
    private readonly dataMarts: McpDataMartManagementFacade,
    private readonly origin: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = updateDataMartDescriptionSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() =>
      this.dataMarts.updateDescription(actor, parsed.data_mart_id, parsed.description)
    );
    return jsonToolResult(
      this.mapper.toSummary(result, context.projectId, this.origin.getPublicOrigin())
    );
  }
}
