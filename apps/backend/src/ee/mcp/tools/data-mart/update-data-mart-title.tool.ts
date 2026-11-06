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
import { updateDataMartTitleSchema, dataMartSummaryOutputSchema } from './data-mart.schemas';

type Input = z.input<typeof updateDataMartTitleSchema>;

@Injectable()
export class UpdateDataMartTitleTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_title';
  readonly description =
    'Change the title of a Data Mart. The tool requires permission to edit the Data Mart. For a legacy BigQuery Data Mart, it also updates the title in OWOX BI.';
  readonly zodSchema = updateDataMartTitleSchema;
  readonly outputSchema = dataMartSummaryOutputSchema.shape;
  readonly annotations = {
    title: 'Update Data Mart Title',
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
    const parsed = updateDataMartTitleSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() =>
      this.dataMarts.updateTitle(actor, parsed.data_mart_id, parsed.title)
    );
    return jsonToolResult(
      this.mapper.toSummary(result, context.projectId, this.origin.getPublicOrigin())
    );
  }
}
