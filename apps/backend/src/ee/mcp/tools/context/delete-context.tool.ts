import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CONTEXTS_FACADE,
  type McpContextsFacade,
} from '../../../../data-marts/facades/mcp-contexts.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z.object({ context_id: z.string().min(1) }).strict();
type DeleteContextInput = z.infer<typeof inputSchema>;

@Injectable()
export class DeleteContextTool implements McpToolDefinition<DeleteContextInput> {
  readonly name = 'delete_context';
  readonly description =
    'Delete a Context in the connected OWOX project. Requires a project admin. First detach it from all Data Marts, Storages, Destinations, members and user provisioning defaults; deletion fails while any attachment remains. Use get_context_impact to inspect attachments.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { context_id: z.string(), status: z.literal('deleted') };
  readonly annotations = {
    title: 'Delete Context',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(@Inject(MCP_CONTEXTS_FACADE) private readonly contexts: McpContextsFacade) {}

  parseInput(input: unknown): DeleteContextInput {
    return inputSchema.parse(input);
  }

  async handler(input: DeleteContextInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    await this.contexts.deleteContext(
      { projectId: context.projectId, userId: context.userId, roles: context.roles },
      { contextId: parsed.context_id }
    );
    return jsonToolResult({ context_id: parsed.context_id, status: 'deleted' });
  }
}
