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
import { createDataMartSchema, dataMartSummaryOutputSchema } from './data-mart.schemas';
import type { DataMartIconValue } from '../../../../data-marts/enums/data-mart-icon.enum';
type Input = z.input<typeof createDataMartSchema>;

@Injectable()
export class CreateDataMartTool implements McpToolDefinition<Input> {
  readonly name = 'create_data_mart';
  readonly description =
    'Create a draft Data Mart in a Storage you can use. The result contains its ID and URL. Then set its definition. Validate the Data Mart. Publish the Data Mart.\n\nCreating a legacy Data Mart also creates the corresponding legacy resource. Check the list before retrying this operation.';
  readonly zodSchema = createDataMartSchema;
  readonly outputSchema = dataMartSummaryOutputSchema.shape;
  readonly annotations = {
    title: 'Create Data Mart',
    readOnlyHint: false,
    destructiveHint: false,
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
    const parsed = createDataMartSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() =>
      this.dataMarts.create(actor, {
        title: parsed.title,
        storageId: parsed.storage_id,
        ...(parsed.icon !== undefined ? { icon: parsed.icon as DataMartIconValue | null } : {}),
      })
    );
    return jsonToolResult(
      this.mapper.toSummary(result, context.projectId, this.origin.getPublicOrigin())
    );
  }
}
