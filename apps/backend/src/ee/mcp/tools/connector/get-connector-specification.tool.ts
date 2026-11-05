import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorTargetSchema, specificationOutputSchema } from './connector.schemas';

const inputSchema = connectorTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetConnectorSpecificationTool implements McpToolDefinition<Input> {
  readonly name = 'get_connector_specification';
  readonly description =
    'Read the parameter schema of a bundled connector. The result excludes OAuth internals and secret defaults. Select a saved Credential for authentication. Do not supply raw secrets. For custom connectors, use get_custom_connector_specification.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = specificationOutputSchema;
  readonly annotations = {
    title: 'Get connector specification',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly connectors: McpConnectorsFacade) {}

  async handler(input: Input, _context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    return jsonToolResult({
      specification: await this.connectors.getSpecification(parsed.connector_name),
    });
  }
}
