import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONTEXT_SETUP_FACADE,
  type McpContextSetupFacade,
} from '../../../../../data-marts/facades/mcp-context-setup.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import {
  contextIdInput,
  contextMemberSchema,
  contextResourceSchema,
} from './context-setup.schemas';

@Injectable()
export class GetContextSetupTool implements McpToolDefinition<z.input<typeof contextIdInput>> {
  readonly name = 'get_context_setup';
  readonly description =
    'Read Context metadata, permitted resource attachments and effective actions. Member assignments require project admin authority. Returns the project Context configuration revision.';
  readonly zodSchema = contextIdInput.shape;
  readonly outputSchema = {
    context: z
      .object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        revision: z.number().int().nonnegative(),
        revisionAggregate: z.literal('project_context_configuration'),
        actions: z
          .object({
            canEdit: z.boolean(),
            canManageMembers: z.boolean(),
            canInspectImpact: z.boolean(),
          })
          .strict(),
        resources: z.array(contextResourceSchema),
        memberAssignments: z.array(contextMemberSchema).nullable(),
      })
      .strict(),
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CONTEXT_SETUP_FACADE) private readonly contexts: McpContextSetupFacade
  ) {}
  async handler(input: z.input<typeof contextIdInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = contextIdInput.parse(input);
    return jsonToolResult({ context: await this.contexts.getContext(actor, parsed.contextId) });
  }
}
