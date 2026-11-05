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
import { updateDataMartIconSchema, dataMartSummaryOutputSchema } from './data-mart.schemas';
import type { DataMartIconValue } from '../../../../data-marts/enums/data-mart-icon.enum';
type Input = z.input<typeof updateDataMartIconSchema>;

@Injectable()
export class UpdateDataMartIconTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_icon';
  readonly description =
    'Set a Data Mart icon. Use a built-in key or lucide:<kebab-case-name>. Null restores the default.';
  readonly zodSchema = updateDataMartIconSchema;
  readonly outputSchema = dataMartSummaryOutputSchema.shape;
  readonly annotations = {
    title: 'Update Data Mart Icon',
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
    private readonly dataMarts: McpDataMartManagementFacade,
    private readonly origin: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = updateDataMartIconSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() =>
      this.dataMarts.updateIcon(actor, parsed.data_mart_id, parsed.icon as DataMartIconValue | null)
    );
    return jsonToolResult(
      this.mapper.toSummary(result, context.projectId, this.origin.getPublicOrigin())
    );
  }
}
