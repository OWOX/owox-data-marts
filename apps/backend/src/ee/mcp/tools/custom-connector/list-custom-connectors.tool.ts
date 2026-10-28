import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorOutputSchema } from './custom-connector.schemas';
import { CustomConnectorToolMapper } from './custom-connector-tool.mapper';

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ListCustomConnectorsTool implements McpToolDefinition<Input> {
  readonly name = 'list_custom_connectors';
  readonly description =
    'List custom connector metadata in the connected project. The result does not include manifests. Use get_custom_connector to read the version history. To read a manifest, use get_custom_connector_version with editor access.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { connectors: z.array(z.object(connectorOutputSchema)) };
  readonly annotations = {
    title: 'List custom connectors',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CustomConnectorToolMapper();

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    inputSchema.parse(input);
    const result = await this.connectors.list(context.projectId);
    return jsonToolResult({
      connectors: result.map(connector => this.mapper.toListItem(connector)),
    });
  }
}
