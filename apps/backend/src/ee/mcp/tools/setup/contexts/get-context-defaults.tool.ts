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

const inputSchema = z.object({}).strict();
@Injectable()
export class GetContextDefaultsTool implements McpToolDefinition<Record<string, never>> {
  readonly name = 'get_context_defaults';
  readonly description =
    'Inspect stored Context provisioning defaults. Admin-only. Defaults affect new members, and do not rewrite existing assignments. Returns the project Context configuration revision.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    defaults: z
      .object({
        roleScope: z.enum(['entire_project', 'selected_contexts']),
        contextIds: z.array(z.string()),
        revision: z.number().int().nonnegative(),
        revisionAggregate: z.literal('project_context_configuration'),
        effect: z.literal('new_members_only'),
      })
      .strict(),
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CONTEXT_SETUP_FACADE) private readonly contexts: McpContextSetupFacade
  ) {}
  async handler(input: Record<string, never>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    inputSchema.parse(input);
    return jsonToolResult({ defaults: await this.contexts.getDefaults(actor) });
  }
}
