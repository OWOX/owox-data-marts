import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorPublishedSchema, specificationOutputSchema } from './custom-connector.schemas';

const inputSchema = connectorPublishedSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetCustomConnectorSpecificationTool implements McpToolDefinition<Input> {
  readonly name = 'get_custom_connector_specification';
  readonly description =
    'Read parameter schemas from a published custom connector version. Omit version to use the active version. Draft versions are not available through this tool. The result excludes secret parameter values and OAuth internals. Nested schema keys use the same camelCase format as the connector HTTP API.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = specificationOutputSchema;
  readonly annotations = {
    title: 'Get custom connector specification',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const result = await this.connectors.getSpecification(
      context.projectId,
      parsed.connector_id,
      parsed.version
    );
    return jsonToolResult({ specification: result });
  }
}
