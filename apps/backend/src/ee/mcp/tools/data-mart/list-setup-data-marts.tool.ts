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
import { listSetupDataMartsSchema, dataMartSummaryOutputSchema } from './data-mart.schemas';

type Input = z.input<typeof listSetupDataMartsSchema>;

@Injectable()
export class ListSetupDataMartsTool implements McpToolDefinition<Input> {
  readonly name = 'list_setup_data_marts';
  readonly description =
    'List visible draft and published Data Marts for setup. Filter by status, Storage or Contexts. Use get_data_mart_setup for configuration. Existing reporting catalog tools still list reportable Data Marts.';
  readonly zodSchema = listSetupDataMartsSchema;
  readonly outputSchema = {
    items: z.array(dataMartSummaryOutputSchema),
    total: z.number(),
    offset: z.number(),
    next_offset: z.number().nullable(),
  };
  readonly annotations = {
    title: 'List Setup Data Marts',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new DataMartToolMapper();

  constructor(
    @Inject(MCP_DATA_MART_MANAGEMENT_FACADE)
    private readonly dataMarts: McpDataMartManagementFacade,
    private readonly origin: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = listSetupDataMartsSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const page = await dataMartToolCall(() =>
      this.dataMarts.list(actor, {
        offset: parsed.offset,
        status: parsed.status,
        storageId: parsed.storage_id,
        contextIds: parsed.context_ids,
      })
    );
    return jsonToolResult({
      items: page.items.map(item =>
        this.mapper.toSummary(item, context.projectId, this.origin.getPublicOrigin())
      ),
      total: page.total,
      offset: page.offset,
      next_offset:
        page.offset + page.items.length < page.total ? page.offset + page.items.length : null,
    });
  }
}
