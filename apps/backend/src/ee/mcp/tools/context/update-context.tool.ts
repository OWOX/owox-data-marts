import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { maxLength } from 'class-validator';
import { z } from 'zod-v4';
import {
  MCP_CONTEXTS_FACADE,
  type McpContextsFacade,
} from '../../../../data-marts/facades/mcp-contexts.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { ContextToolMapper, contextOutputSchema } from './context-tool.mapper';

const inputSchema = z
  .object({
    context_id: z.string().min(1),
    name: z
      .string()
      .min(1)
      .refine(value => maxLength(value, 255), 'Name must not exceed 255 characters')
      .describe(
        'Context name, 1–255 characters, using the same Unicode length rules as the Context API.'
      ),
    description: z.string().nullable().optional(),
  })
  .strict();
type UpdateContextInput = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateContextTool implements McpToolDefinition<UpdateContextInput> {
  readonly name = 'update_context';
  readonly description =
    'Update a Context name and optionally its description in the connected OWOX project. Requires a project admin. The name is required; omit description to preserve it or pass null to clear it.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = contextOutputSchema;
  readonly annotations = {
    title: 'Update Context',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  private readonly mapper = new ContextToolMapper();

  constructor(@Inject(MCP_CONTEXTS_FACADE) private readonly contexts: McpContextsFacade) {}

  parseInput(input: unknown): UpdateContextInput {
    return inputSchema.parse(input);
  }

  async handler(input: UpdateContextInput, context: McpAuthContext): Promise<McpToolResult> {
    const { context_id, ...properties } = this.parseInput(input);
    const result = await this.contexts.updateContext(
      { projectId: context.projectId, userId: context.userId, roles: context.roles },
      { contextId: context_id, ...properties }
    );
    return jsonToolResult(this.mapper.toOutput(result));
  }
}
