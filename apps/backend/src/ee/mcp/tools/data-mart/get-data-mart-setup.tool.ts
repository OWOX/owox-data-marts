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
import { dataMartIdSchema, dataMartSetupOutputSchema } from './data-mart.schemas';

type Input = z.input<typeof dataMartIdSchema>;

@Injectable()
export class GetDataMartSetupTool implements McpToolDefinition<Input> {
  readonly name = 'get_data_mart_setup';
  readonly description =
    'Read the stored setup of a visible Data Mart, including draft configuration, SQL, complete schema and access settings. This tool does not synchronize legacy Data Marts. Connector settings omit secrets and internal references. Preserve configuration _id and _credential_id when replacing a connector definition.';
  readonly zodSchema = dataMartIdSchema;
  readonly outputSchema = dataMartSetupOutputSchema.shape;
  readonly annotations = {
    title: 'Get Data Mart Setup',
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
    const parsed = dataMartIdSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() => this.dataMarts.get(actor, parsed.data_mart_id));
    return jsonToolResult(
      this.mapper.toSetup(result, context.projectId, this.origin.getPublicOrigin())
    );
  }
}
