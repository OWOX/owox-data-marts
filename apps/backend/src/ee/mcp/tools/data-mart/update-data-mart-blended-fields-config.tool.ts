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
  blendedFieldsConfigSchema,
} from './data-mart-configuration.schemas';
const inputSchema = z
  .object({ ...dataMartTargetShape, blended_fields_config: blendedFieldsConfigSchema.nullable() })
  .strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartBlendedFieldsConfigTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_blended_fields_config';
  readonly description =
    'Replace blended field configuration: source paths, display aliases, exclusions, join descriptions, and per-field aggregation/visibility overrides. Nested properties use the API names. Start from the current configuration and preserve sources and fields that should remain. Pass null to clear all overrides. Requires editor or admin and edit access.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = dataMartConfigurationOutput;
  readonly annotations = {
    title: 'Update Data Mart Blended Fields Config',
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
    const result = await this.facade.updateDataMartBlendedFieldsConfig(ctx, {
      dataMartId: parsed.data_mart_id,
      blendedFieldsConfig: parsed.blended_fields_config,
    });
    return jsonToolResult({ data_mart: result });
  }
}
