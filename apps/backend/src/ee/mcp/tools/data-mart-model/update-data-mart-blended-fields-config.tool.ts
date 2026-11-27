import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import type { z } from 'zod';
import {
  MCP_DATA_MART_MODEL_FACADE,
  type McpDataMartModelFacade,
} from '../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition } from '../mcp-tool.definition';
import {
  savedBlendedConfigOutputSchema,
  updateBlendedConfigSchema,
} from './blended-fields-config.schemas';

type Input = z.infer<typeof updateBlendedConfigSchema>;

@Injectable()
export class UpdateDataMartBlendedFieldsConfigTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_blended_fields_config';
  readonly description =
    'Replace Output Aliases and other settings for joined fields on a root Data Mart. Read blended_fields_config from get_data_mart_setup for the same data_mart_id. Reuse the full join path from joins[].aliasPath in the joined field list or nodes[].aliasPath in the relationship graph. Include all overrides you want to keep. Send null to clear all overrides. You need the editor role and EDIT access to the root Data Mart.';
  readonly zodSchema = updateBlendedConfigSchema;
  readonly outputSchema = savedBlendedConfigOutputSchema;
  readonly annotations = {
    title: 'Update settings for joined Data Mart fields',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';

  constructor(@Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade) {}

  async handler(input: Input, context: McpAuthContext) {
    const { data_mart_id, blended_fields_config } = this.zodSchema.parse(input);
    const actor = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const saved = await this.model.updateBlendedFieldsConfig(
      actor,
      data_mart_id,
      blended_fields_config
    );
    return jsonToolResult({ data_mart_id, blended_fields_config: saved });
  }
}
