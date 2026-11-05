import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ListConnectorsTool implements McpToolDefinition<Input> {
  readonly name = 'list_connectors';
  readonly description =
    'List bundled connector metadata. Use name as connector_name in the other connector tools. Use list_custom_connectors for custom connectors.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = {
    connectors: z.array(
      z.object({
        name: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        doc_url: z.string().nullable(),
      })
    ),
  };
  readonly annotations = {
    title: 'List connectors',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly connectors: McpConnectorsFacade) {}

  async handler(input: Input, _context: McpAuthContext): Promise<McpToolResult> {
    inputSchema.parse(input);
    const result = await this.connectors.list();
    return jsonToolResult({
      connectors: result.map(connector => ({
        name: connector.name,
        title: connector.title,
        description: connector.description,
        doc_url: connector.docUrl,
      })),
    });
  }
}
