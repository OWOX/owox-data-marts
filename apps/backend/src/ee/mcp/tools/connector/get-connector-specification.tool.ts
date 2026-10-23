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
  connectorParameterSchema,
  connectorTargetShape,
} from './connector.schemas';

const inputSchema = z.object(connectorTargetShape).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetConnectorSpecificationTool implements McpToolDefinition<Input> {
  readonly name = 'get_connector_specification';
  readonly description =
    'Read connector configuration parameters, conditional alternatives and dynamic-option dependencies. Use names from this specification in connector.source.configuration. Version selection is available only for published custom connector versions; omit version for bundled connectors or the active custom version. Requires project viewer access. Complete secret entry or OAuth authentication in the web app, then use list_connector_configurations to reuse the saved configuration.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    specification: z.array(connectorParameterSchema),
    ...connectorNextStepsOutput,
  };
  readonly annotations = {
    title: 'Get Connector Specification',
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
    const specification = await this.facade.getConnectorSpecification(ctx, {
      connectorName: parsed.connector_name,
      ...(parsed.version !== undefined ? { version: parsed.version } : {}),
    });
    return jsonToolResult({
      specification,
      next_steps: [
        'Use the returned parameter names and conditional oneOf alternatives as configuration keys. For DYNAMIC_OPTIONS, fill optionsDependsOn and call preview_connector_field_options.',
        'Call get_connector_fields for nodes and fields, and list_connector_configurations to reuse saved authorization. Complete new secret entry or OAuth in the web app and save the draft before continuing.',
      ],
    });
  }
}
