import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  dataMartTargetShape,
  dataMartConfigurationOutput,
} from './data-mart-configuration.schemas';
const inputSchema = z
  .object({
    ...dataMartTargetShape,
    business_owner_ids: z
      .array(z.string().min(1))
      .max(100)
      .describe(
        'Complete replacement business-owner list using user_id values from list_project_members. Empty clears business owners; preserve owners that should remain.'
      ),
    technical_owner_ids: z
      .array(z.string().min(1))
      .max(100)
      .describe(
        'Complete replacement technical-owner list using user_id values from list_project_members. Empty clears technical owners and can remove your own maintenance access.'
      ),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartOwnersTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_owners';
  readonly description =
    'Replace both business and technical owner lists of a Data Mart. Empty arrays clear the corresponding list. Use user_id values from list_project_members; owner IDs must belong to the connected project. Requires editor or admin and permission to manage owners; having general edit access alone is insufficient.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = dataMartConfigurationOutput;
  readonly annotations = {
    title: 'Update Data Mart Owners',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const result = await this.facade.updateDataMartOwners(ctx, {
      dataMartId: parsed.data_mart_id,
      businessOwnerIds: parsed.business_owner_ids,
      technicalOwnerIds: parsed.technical_owner_ids,
    });
    return jsonToolResult({ data_mart: result });
  }
}
