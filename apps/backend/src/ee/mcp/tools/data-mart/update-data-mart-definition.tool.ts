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
  dataMartDefinitionInput,
} from './data-mart-configuration.schemas';
const inputSchema = z
  .object({
    ...dataMartTargetShape,
    definition: dataMartDefinitionInput,
    source_data_mart_id: z
      .uuid()
      .optional()
      .describe(
        'Source Data Mart ID from list_connector_configurations. Provide together with source_configuration_id for a CONNECTOR definition with exactly one configuration of overrides. Requires EDIT on the source.'
      ),
    source_configuration_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Public configuration_id from list_connector_configurations. With source_data_mart_id, copies settings and credentials on the server; configuration:[{}] reuses it unchanged. Provided top-level parameters replace saved ones.'
      ),
  })
  .strict()
  .superRefine((input, ctx) => {
    const hasSource = input.source_data_mart_id !== undefined;
    const hasConfiguration = input.source_configuration_id !== undefined;
    if (hasSource !== hasConfiguration) {
      ctx.addIssue({
        code: 'custom',
        path: [hasSource ? 'source_configuration_id' : 'source_data_mart_id'],
        message: 'Provide both source_data_mart_id and source_configuration_id',
      });
    }
    if (hasSource || hasConfiguration) {
      if (input.definition.type !== 'CONNECTOR') {
        ctx.addIssue({
          code: 'custom',
          path: ['definition'],
          message: 'Source copy requires CONNECTOR',
        });
      } else if (input.definition.connector.source.configuration.length !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['definition', 'connector', 'source', 'configuration'],
          message: 'Source copy requires exactly one configuration of overrides',
        });
      }
    }
  });
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartDefinitionTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_definition';
  readonly description =
    'Replace the saved source definition of a Data Mart. definition contains type plus its matching body: SQL uses sqlQuery, TABLE/VIEW fullyQualifiedName, TABLE_PATTERN pattern, and CONNECTOR connector.source and connector.storage. Example: {data_mart_id:"id",definition:{type:"SQL",sqlQuery:"SELECT 1"}}. Read get_data_mart_configuration first and add type: definitionType to its saved definition body; preserve masked connector values. Discover connector names, parameters, nodes and fields with list_connectors, get_connector_specification and get_connector_fields. Reuse a configuration from list_connector_configurations by passing both public source IDs and exactly one configuration of parameter overrides ([{}] copies unchanged); credentials are copied on the server after checking source EDIT access. Configure new credentials in OWOX without pasting secrets into chat. Switching to or from CONNECTOR is not supported. Other source type changes are validated against the warehouse before saving; saved schemas may need actualization. Requires editor or admin and edit access.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = dataMartConfigurationOutput;
  readonly annotations = {
    title: 'Update Data Mart Definition',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
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
    const { type, ...definition } = parsed.definition;
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const result = await this.facade.updateDataMartDefinition(ctx, {
      dataMartId: parsed.data_mart_id,
      definitionType: type,
      definition,
      ...(parsed.source_data_mart_id !== undefined
        ? { sourceDataMartId: parsed.source_data_mart_id }
        : {}),
      ...(parsed.source_configuration_id !== undefined
        ? { sourceConfigurationId: parsed.source_configuration_id }
        : {}),
    });
    return jsonToolResult({ data_mart: result });
  }
}
