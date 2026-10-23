import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  connectorFieldOptionSchema,
  connectorFieldOptionsPreviewInputSchema,
  connectorNextStepsOutput,
} from './connector.schemas';

type Input = z.infer<typeof connectorFieldOptionsPreviewInputSchema>;

@Injectable()
export class PreviewConnectorFieldOptionsTool implements McpToolDefinition<Input> {
  readonly name = 'preview_connector_field_options';
  readonly description =
    'Resolve allowed values for a DYNAMIC_OPTIONS parameter from get_connector_specification. Fill its optionsDependsOn parameters in configuration. Requires editor or admin. Supply only non-secret parameters and, when credentials are needed, both source IDs from list_connector_configurations; the server checks EDIT access to the source Data Mart. Supplied top-level parameters replace saved parameters; omitted parameters are reused. Complete authentication in the web app. Preview support follows the existing connector API.';
  readonly zodSchema = connectorFieldOptionsPreviewInputSchema.shape;
  readonly outputSchema = {
    options: z.array(connectorFieldOptionSchema),
    ...connectorNextStepsOutput,
  };
  readonly annotations = {
    title: 'Preview Connector Field Options',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly facade: McpConnectorsFacade) {}

  parseInput(input: unknown): Input {
    return connectorFieldOptionsPreviewInputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const options = await this.facade.previewConnectorFieldOptions(ctx, {
      connectorName: parsed.connector_name,
      field: parsed.field,
      ...(parsed.configuration !== undefined ? { configuration: parsed.configuration } : {}),
      ...(parsed.source_data_mart_id !== undefined
        ? {
            sourceDataMartId: parsed.source_data_mart_id,
            sourceConfigurationId: parsed.source_configuration_id,
          }
        : {}),
    });
    return jsonToolResult({
      options,
      next_steps: options.length
        ? [
            `Use a returned option.value for configuration.${parsed.field}, then call preview_connector_fields with the selected configuration and public source IDs. Do not invent option values.`,
          ]
        : [
            "No options were returned. Check this parameter's optionsDependsOn values from get_connector_specification. If the user needs new Google permissions or source selection, give them the draft setup_url from get_data_mart_configuration, then retry after they save and confirm.",
          ],
    });
  }
}
