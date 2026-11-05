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
export class GetDataMartChangeImpactTool implements McpToolDefinition<Input> {
  readonly name = 'get_data_mart_change_impact';
  readonly description =
    'Inspect Reports, relationships and SQL Data Marts affected by a change to the input source or by deletion. Hidden referencing Data Marts are counted without names or IDs. Deletion also removes Data Mart schedules. Warehouse tables remain. Review this impact with the user before destructive changes.';
  readonly zodSchema = dataMartIdSchema;
  readonly outputSchema = {
    outbound_relationships_count: z.number(),
    inbound_relationships_count: z.number(),
    reports_count: z.number(),
    referencing_data_marts_count: z.number(),
    referencing_data_marts: z.array(z.object({ data_mart_id: z.string(), title: z.string() })),
  };
  readonly annotations = {
    title: 'Get Data Mart Change Impact',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new DataMartToolMapper();

  constructor(
    @Inject(MCP_DATA_MART_MANAGEMENT_FACADE)
    private readonly dataMarts: McpDataMartManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = dataMartIdSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() => this.dataMarts.impact(actor, parsed.data_mart_id));
    return jsonToolResult({
      outbound_relationships_count: result.outboundRelationshipsCount,
      inbound_relationships_count: result.inboundRelationshipsCount,
      reports_count: result.reportsCount,
      referencing_data_marts_count: result.referencingDataMartsCount,
      referencing_data_marts: result.referencingDataMarts.map(item => ({
        data_mart_id: item.id,
        title: item.title,
      })),
    });
  }
}
