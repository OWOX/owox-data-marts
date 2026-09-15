import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z
  .object({ prompt: z.string().min(2).max(256), limit: z.number().int().min(1).max(25).optional() })
  .strict();
type SearchConnectorsInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorSearchTool implements McpToolDefinition<SearchConnectorsInput> {
  readonly name = 'connector_search';
  readonly description =
    'Find the connectors most relevant to a natural-language data need (e.g. "I need data from Facebook Ads"). ' +
    "Each result's `connector_id` is what connector_publish (to update), connector_delete, connector_versions, " +
    'and connector_set_version take; it is null for bundled connectors, which cannot be updated, deleted, or versioned.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    connectors: z.array(
      z.object({
        name: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        kind: z.enum(['bundled', 'custom']),
        relevanceScore: z.number(),
        connector_id: z.string().nullable(),
      })
    ),
  };
  readonly annotations = {
    title: 'Connector Search',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly connectors: McpConnectorsFacade) {}

  parseInput(input: unknown): SearchConnectorsInput {
    return inputSchema.parse(input);
  }

  async handler(input: SearchConnectorsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.connectors.matchByPrompt({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      prompt: parsed.prompt,
      limit: parsed.limit,
    });
    return jsonToolResult({
      connectors: result.connectors.map(c => ({
        name: c.name,
        title: c.title,
        description: c.description,
        kind: c.kind,
        relevanceScore: c.relevanceScore,
        connector_id: c.connectorId,
      })),
    });
  }
}
