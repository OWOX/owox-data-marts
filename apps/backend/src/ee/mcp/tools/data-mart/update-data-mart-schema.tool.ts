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
import { updateDataMartSchemaSchema, dataMartSummaryOutputSchema } from './data-mart.schemas';

type Input = z.input<typeof updateDataMartSchemaSchema>;

@Injectable()
export class UpdateDataMartSchemaTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_schema';
  readonly description =
    'Replace the complete saved Data Mart schema. Read get_data_mart_setup first. Preserve fields you are not changing. The tool uses OWOX field, formula, inheritance and warehouse validation. Review returned warning reasons. OWOX shows details and warnings beyond the first 50.';
  readonly zodSchema = updateDataMartSchemaSchema;
  readonly outputSchema = {
    ...dataMartSummaryOutputSchema.shape,
    schema: z.record(z.string(), z.unknown()).nullable(),
    warning_count: z.number(),
    warnings: z.array(z.object({ code: z.string(), message: z.string() })).max(50),
    message: z.string().optional(),
  };
  readonly annotations = {
    title: 'Update Data Mart Schema',
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
    const parsed = updateDataMartSchemaSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() =>
      this.dataMarts.updateSchema(actor, parsed.data_mart_id, parsed.schema)
    );
    return jsonToolResult(
      this.mapper.toSchemaResult(result, context.projectId, this.origin.getPublicOrigin())
    );
  }
}
