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
import { dataMartIdSchema, dataMartSummaryOutputSchema } from './data-mart.schemas';

type Input = z.input<typeof dataMartIdSchema>;

@Injectable()
export class ActualizeDataMartSchemaTool implements McpToolDefinition<Input> {
  readonly name = 'actualize_data_mart_schema';
  readonly description =
    'Refresh and save the Data Mart schema from its configured source. The tool requires permission to edit the Data Mart and may call the warehouse. Existing field metadata follows the same refresh rules as OWOX. The tool waits for the refresh to finish. A slow warehouse can exceed the client timeout. Read get_data_mart_setup before retrying.';
  readonly zodSchema = dataMartIdSchema;
  readonly outputSchema = {
    ...dataMartSummaryOutputSchema.shape,
    schema: z.record(z.string(), z.unknown()).nullable(),
    warning_count: z.number(),
    warnings: z.array(z.object({ code: z.string(), message: z.string() })).max(50),
    message: z.string().optional(),
  };
  readonly annotations = {
    title: 'Actualize Data Mart Schema',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new DataMartToolMapper();

  constructor(
    @Inject(MCP_DATA_MART_MANAGEMENT_FACADE)
    private readonly dataMarts: McpDataMartManagementFacade,
    private readonly origin: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = dataMartIdSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() =>
      this.dataMarts.actualizeSchema(actor, parsed.data_mart_id)
    );
    return jsonToolResult(
      this.mapper.toSchemaResult(result, context.projectId, this.origin.getPublicOrigin())
    );
  }
}
