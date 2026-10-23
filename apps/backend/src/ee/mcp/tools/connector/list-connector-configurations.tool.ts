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
  connectorConfigurationSchema,
  connectorNameSchema,
  connectorNextStepsOutput,
} from './connector.schemas';

const inputSchema = z.object({ connector_name: connectorNameSchema }).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ListConnectorConfigurationsTool implements McpToolDefinition<Input> {
  readonly name = 'list_connector_configurations';
  readonly description =
    'List masked reusable configurations for a connector in the connected project. Requires editor or admin and EDIT access to each source Data Mart. Choose the returned data_mart_id and configuration_id as source_data_mart_id and source_configuration_id in update_data_mart_definition or connector previews; the server resolves credentials. Complete initial secret entry or OAuth authentication in the web app. Masked values are not credentials.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    configurations: z.array(connectorConfigurationSchema),
    ...connectorNextStepsOutput,
  };
  readonly annotations = {
    title: 'List Connector Configurations',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly facade: McpConnectorsFacade) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const configurations = await this.facade.listConnectorConfigurations(ctx, {
      connectorName: parsed.connector_name,
    });
    return jsonToolResult({
      configurations: configurations.map(configuration => ({
        data_mart_id: configuration.dataMartId,
        data_mart_title: configuration.dataMartTitle,
        configuration_id: configuration.configurationId,
        connector_name: configuration.connectorName,
        version: configuration.version,
        configuration: configuration.configuration,
      })),
      next_steps: configurations.length
        ? [
            'Choose a source row and pass its data_mart_id as source_data_mart_id and configuration_id as source_configuration_id to connector previews or update_data_mart_definition. The server resolves saved authorization.',
            'When copying a definition, provide exactly one configuration of top-level overrides; [{}] copies unchanged. Validate the saved definition before publishing.',
          ]
        : [
            'No editable saved configuration was found. Use get_data_mart_configuration for an existing draft, or create_data_mart with connector_name and an existing storage_id (requires mcp:write).',
            'Give the user the returned setup_url. Have them authenticate, select the spreadsheet or source when needed, and save setup in the web app. Wait for their confirmation; do not request secrets in chat.',
            'After confirmation, call get_data_mart_configuration and list_connector_configurations again for the same draft. Use its saved public IDs and validate the definition before continuing.',
          ],
    });
  }
}
