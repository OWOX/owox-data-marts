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
  connectorNextStepsOutput,
  connectorNodeSchema,
  connectorPreviewInputSchema,
} from './connector.schemas';

type Input = z.infer<typeof connectorPreviewInputSchema>;

@Injectable()
export class PreviewConnectorFieldsTool implements McpToolDefinition<Input> {
  readonly name = 'preview_connector_fields';
  readonly description =
    'Resolve configuration-dependent connector nodes and fields using the connector API. Requires editor or admin. Supply non-secret configuration parameters and, when needed, both source IDs from list_connector_configurations; saved credentials are resolved on the server after checking EDIT access to the source Data Mart. Supplied top-level parameters replace saved parameters; omitted parameters are reused. Complete authentication in the web app. Preview support follows the existing connector API.';
  readonly zodSchema = connectorPreviewInputSchema.shape;
  readonly outputSchema = { nodes: z.array(connectorNodeSchema), ...connectorNextStepsOutput };
  readonly annotations = {
    title: 'Preview Connector Fields',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly facade: McpConnectorsFacade) {}

  parseInput(input: unknown): Input {
    return connectorPreviewInputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const nodes = await this.facade.previewConnectorFields(ctx, {
      connectorName: parsed.connector_name,
      ...(parsed.configuration !== undefined ? { configuration: parsed.configuration } : {}),
      ...(parsed.source_data_mart_id !== undefined
        ? {
            sourceDataMartId: parsed.source_data_mart_id,
            sourceConfigurationId: parsed.source_configuration_id,
          }
        : {}),
    });
    return jsonToolResult({
      nodes,
      next_steps: nodes.length
        ? [
            'Use the returned node and fields in update_data_mart_definition, preserving the selected public source IDs when copying saved configuration. Validate the saved definition, actualize its schema, and publish when ready.',
          ]
        : [
            'No fields were returned. Review get_connector_specification and the selected configuration; use the draft setup_url from get_data_mart_configuration if the user must authenticate or choose a spreadsheet in the web app. Save and confirm before retrying.',
          ],
    });
  }
}
