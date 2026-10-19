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
import { contextMemberSchema, memberQueryInput } from './context-setup.schemas';

@Injectable()
export class ListSetupProjectMembersTool implements McpToolDefinition<
  z.input<typeof memberQueryInput>
> {
  readonly name = 'list_setup_project_members';
  readonly description =
    'Find existing project members by name, email or ID. Editors can discover members for resource owner selection; scope and Context assignments are returned only to project admins. This grants no membership administration rights.';
  readonly zodSchema = memberQueryInput.shape;
  readonly outputSchema = { members: z.array(contextMemberSchema) };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CONTEXT_SETUP_FACADE) private readonly contexts: McpContextSetupFacade
  ) {}
  async handler(input: z.input<typeof memberQueryInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    return jsonToolResult({
      members: await this.contexts.listMembers(actor, memberQueryInput.parse(input)),
    });
  }
}
