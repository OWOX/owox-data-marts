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
  connectorTargetShape,
} from './connector.schemas';

const inputSchema = z.object(connectorTargetShape).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetConnectorFieldsTool implements McpToolDefinition<Input> {
  readonly name = 'get_connector_fields';
  readonly description =
    'Read static connector nodes and fields for connector.source.node and connector.source.fields. Version selection is available only for published custom connector versions; omit version for bundled connectors or the active custom version. For configuration-dependent fields, use preview_connector_fields with non-secret configuration and optional reusable source IDs. Requires project viewer access.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { nodes: z.array(connectorNodeSchema), ...connectorNextStepsOutput };
  readonly annotations = {
    title: 'Get Connector Fields',
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
    const nodes = await this.facade.getConnectorFields(ctx, {
      connectorName: parsed.connector_name,
      ...(parsed.version !== undefined ? { version: parsed.version } : {}),
    });
    return jsonToolResult({
      nodes,
      next_steps: [
        'Use returned node and field names in connector.source.node and fields. For configuration-dependent fields, call preview_connector_fields with parameters and saved source IDs.',
        'Read get_connector_specification and list_connector_configurations before saving a CONNECTOR definition with update_data_mart_definition. Validate the saved definition before publishing.',
      ],
    });
  }
}
