import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorTargetSchema, fieldsOutputSchema } from './connector.schemas';

const inputSchema = connectorTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetConnectorFieldsTool implements McpToolDefinition<Input> {
  readonly name = 'get_connector_fields';
  readonly description =
    'Read the stored field schema of a bundled connector without contacting the source. Use preview_connector_fields for a live schema. For custom connectors, use get_custom_connector_fields.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = fieldsOutputSchema;
  readonly annotations = {
    title: 'Get connector fields',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly connectors: McpConnectorsFacade) {}

  async handler(input: Input, _context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    return jsonToolResult({ fields: await this.connectors.getFields(parsed.connector_name) });
  }
}
