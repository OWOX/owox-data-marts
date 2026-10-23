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
type CreateContextInput = z.infer<typeof inputSchema>;

@Injectable()
export class CreateContextTool implements McpToolDefinition<CreateContextInput> {
  readonly name = 'create_context';
  readonly description =
    'Create a business Context in the connected OWOX project. Requires a project admin. Provide a name and optionally a description; null creates a Context without a description.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = contextOutputSchema;
  readonly annotations = {
    title: 'Create Context',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  private readonly mapper = new ContextToolMapper();

  constructor(@Inject(MCP_CONTEXTS_FACADE) private readonly contexts: McpContextsFacade) {}

  parseInput(input: unknown): CreateContextInput {
    return inputSchema.parse(input);
  }

  async handler(input: CreateContextInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.contexts.createContext(
      { projectId: context.projectId, userId: context.userId, roles: context.roles },
      parsed
    );
    return jsonToolResult(this.mapper.toOutput(result));
  }
}
