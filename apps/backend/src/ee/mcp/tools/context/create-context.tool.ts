import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CONTEXTS_FACADE,
  type McpContextsFacade,
} from '../../../../data-marts/facades/mcp-contexts.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { ContextToolMapper, contextOutputSchema } from './context-tool.mapper';
import { contextIconSchema, contextNameSchema } from './context.schemas';

const inputSchema = z
  .object({
    name: contextNameSchema,
    description: z.string().nullable().optional(),
    icon: contextIconSchema.nullable().optional(),
  })
  .strict();
type CreateContextInput = z.infer<typeof inputSchema>;

@Injectable()
export class CreateContextTool implements McpToolDefinition<CreateContextInput> {
  readonly name = 'create_context';
  readonly description =
    'Create a business Context in the connected OWOX project. Requires a project admin. Provide a name and optionally a description and icon. Omitted or null descriptions are empty; an omitted or null icon uses the default.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = contextOutputSchema;
  readonly annotations = {
    title: 'Create Context',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'admin';
  private readonly mapper = new ContextToolMapper();

  constructor(@Inject(MCP_CONTEXTS_FACADE) private readonly contexts: McpContextsFacade) {}

  parseInput(input: unknown): CreateContextInput {
    return inputSchema.parse(input);
  }

  async handler(input: CreateContextInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.contexts.createContext(
      { projectId: context.projectId, userId: context.userId },
      parsed
    );
    return jsonToolResult(this.mapper.toOutput(result));
  }
}
