import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorTargetSchema } from './custom-connector.schemas';

const inputSchema = connectorTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class DeleteCustomConnectorTool implements McpToolDefinition<Input> {
  readonly name = 'delete_custom_connector';
  readonly description =
    'Soft-delete a custom connector and make its name available for reuse. You must be an editor. Deletion fails if any Data Mart references the connector, including a pinned version. Before retrying, reconfigure or remove those references in the OWOX web app. Do not delete Data Marts to bypass this restriction.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { success: z.boolean() };
  readonly annotations = {
    title: 'Delete custom connector',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    await this.connectors.delete(context.projectId, parsed.connector_id);
    return jsonToolResult({ success: true });
  }
}
