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
import { contextChanges, mutationPrecondition, mutationOutput } from './context-mutation.schemas';
const inputSchema = contextChanges.set_entity_contexts
  .omit({ action: true })
  .extend({ ...mutationPrecondition })
  .strict();
@Injectable()
export class SetEntityContextsTool implements McpToolDefinition<z.input<typeof inputSchema>> {
  readonly name = 'set_entity_contexts';
  readonly description =
    'Requires express user authorization for this Context change. Read get_context_impact with the exact proposed change and confirm its revision and digest before applying. Scope changes preserve IdP roles and provisioning mode.';
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
        action: 'set_entity_contexts',
        ...parsed,
      } as ContextMutation),
    });
  }
}
