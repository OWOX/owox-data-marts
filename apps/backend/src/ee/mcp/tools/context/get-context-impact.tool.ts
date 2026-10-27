import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CONTEXTS_FACADE,
  type McpContextsFacade,
} from '../../../../data-marts/facades/mcp-contexts.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { ContextToolMapper, contextImpactOutputSchema } from './context-tool.mapper';

const inputSchema = z.object({ context_id: z.string().min(1) }).strict();
type GetContextImpactInput = z.infer<typeof inputSchema>;

@Injectable()
export class GetContextImpactTool implements McpToolDefinition<GetContextImpactInput> {
  readonly name = 'get_context_impact';
  readonly description =
    'Inspect a Context before deleting it: return counts of attached Data Marts, Storages, Destinations, members and user provisioning defaults, plus affected member IDs. Requires a project admin.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = contextImpactOutputSchema;
  readonly annotations = {
    title: 'Get Context Impact',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'admin';
  private readonly mapper = new ContextToolMapper();

  constructor(@Inject(MCP_CONTEXTS_FACADE) private readonly contexts: McpContextsFacade) {}

  parseInput(input: unknown): GetContextImpactInput {
    return inputSchema.parse(input);
  }

  async handler(input: GetContextImpactInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.contexts.getContextImpact(
      { projectId: context.projectId, userId: context.userId },
      { contextId: parsed.context_id }
    );
    return jsonToolResult(this.mapper.toImpactOutput(result));
  }
}
