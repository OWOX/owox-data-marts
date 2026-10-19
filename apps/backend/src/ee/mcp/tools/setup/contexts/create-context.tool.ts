import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONTEXT_SETUP_FACADE,
  type McpContextSetupFacade,
} from '../../../../../data-marts/facades/mcp-context-setup.facade';
import type { ContextMutation } from '../../../../../data-marts/dto/domain/context-mutation.dto';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import { mutationOutput, operationId } from './context-mutation.schemas';
const inputSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(100000).optional(),
    operationId,
  })
  .strict();
@Injectable()
export class CreateContextTool implements McpToolDefinition<z.input<typeof inputSchema>> {
  readonly name = 'create_context';
  readonly description =
    'Requires express user authorization for this Context change. Supply a stable operationId to recover the same created Context on retry. Scope changes preserve IdP roles and provisioning mode.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = mutationOutput;
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CONTEXT_SETUP_FACADE) private readonly contexts: McpContextSetupFacade
  ) {}
  async handler(input: z.input<typeof inputSchema>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = inputSchema.parse(input);
    return jsonToolResult({
      outcome: await this.contexts.mutate(actor, {
        action: 'create_context',
        ...parsed,
      } as ContextMutation),
    });
  }
}
