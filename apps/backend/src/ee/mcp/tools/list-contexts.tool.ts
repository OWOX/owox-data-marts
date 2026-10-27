import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONTEXTS_FACADE,
  type McpContextsFacade,
} from '../../../data-marts/facades/mcp-contexts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition } from './mcp-tool.definition';
import { contextIconOutputSchema } from './context/context.schemas';

@Injectable()
export class ListContextsTool implements McpToolDefinition<Record<string, never>> {
  readonly name = 'list_contexts';
  readonly description =
    'List business contexts in the connected OWOX project, including IDs, names, complete descriptions and icon keys (null when unset). Discovery flow: get_project_context → list_contexts → list_data_marts or get_relevant_data_marts_by_prompt with context_ids → get_data_mart_details_by_id. Read descriptions for business goals and Markdown links to specific Data Marts. Listing a context or following a reference never grants access to its resources; all Data Mart tools enforce existing access controls.';
  readonly zodSchema = z.object({}).strict();
  readonly outputSchema = {
    contexts: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        icon: contextIconOutputSchema,
      })
    ),
  };
  readonly annotations = {
    title: 'List Project Contexts',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(@Inject(MCP_CONTEXTS_FACADE) private readonly contexts: McpContextsFacade) {}
  async handler(input: Record<string, never>, context: McpAuthContext) {
    this.zodSchema.parse(input);
    return jsonToolResult({ contexts: await this.contexts.listContexts(context.projectId) });
  }
}
