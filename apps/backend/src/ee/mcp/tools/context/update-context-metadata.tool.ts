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
    context_id: z.string().min(1),
    name: contextNameSchema
      .optional()
      .describe(
        'New non-empty Context name, at most 255 characters. Omit to preserve it; null is not allowed.'
      ),
    description: z
      .string()
      .nullable()
      .optional()
      .describe('New Context description. Omit to preserve it or pass null to clear it.'),
    icon: contextIconSchema
      .nullable()
      .optional()
      .describe(
        'Built-in icon key or lucide:<kebab-case-name>. Omit to preserve it or pass null to restore the default icon.'
      ),
  })
  .strict()
  .refine(
    input =>
      input.name !== undefined || input.description !== undefined || input.icon !== undefined,
    'Provide at least one of name, description or icon'
  );
type UpdateContextMetadataInput = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateContextMetadataTool implements McpToolDefinition<UpdateContextMetadataInput> {
  readonly name = 'update_context_metadata';
  readonly description =
    'Update the name, description and/or icon of a Context in the connected OWOX project. Supply at least one metadata field. Omitted fields are preserved; null clears description or resets icon, but name must be a non-empty string. Requires a project admin.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = contextOutputSchema;
  readonly annotations = {
    title: 'Update Context Metadata',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'admin';
  private readonly mapper = new ContextToolMapper();

  constructor(@Inject(MCP_CONTEXTS_FACADE) private readonly contexts: McpContextsFacade) {}

  parseInput(input: unknown): UpdateContextMetadataInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: UpdateContextMetadataInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const { context_id, ...properties } = this.parseInput(input);
    const result = await this.contexts.updateContextMetadata(
      { projectId: context.projectId, userId: context.userId },
      { contextId: context_id, ...properties }
    );
    return jsonToolResult(this.mapper.toOutput(result));
  }
}
