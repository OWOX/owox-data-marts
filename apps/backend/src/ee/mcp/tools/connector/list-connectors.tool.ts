import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorNextStepsOutput, connectorSummarySchema } from './connector.schemas';

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ListConnectorsTool implements McpToolDefinition<Input> {
  readonly name = 'list_connectors';
  readonly description =
    'List bundled connectors and published custom connectors in the connected project. Use the returned name with get_connector_specification and get_connector_fields to configure a connector Data Mart. Requires project viewer access; credentials and raw connector manifests are never returned.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    connectors: z.array(connectorSummarySchema),
    ...connectorNextStepsOutput,
  };
  readonly annotations = {
    title: 'List Connectors',
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
    this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const connectors = await this.facade.listConnectors(ctx);
    return jsonToolResult({
      connectors: connectors.map(connector => ({
        id: connector.id,
        name: connector.name,
        title: connector.title,
        description: connector.description,
        doc_url: connector.docUrl,
        is_custom: connector.isCustom,
        active_version: connector.activeVersion,
        capabilities: connector.capabilities,
      })),
      next_steps: [
        'Choose a returned name, then call get_connector_specification and get_connector_fields with connector_name. Use version only for a published custom connector version.',
        'For saved authorization, call list_connector_configurations. For new authorization, create_data_mart can return setup_url for the user to complete and save setup in the web app.',
      ],
    });
  }
}
