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
import { contextResourceSchema, resourceQueryInput } from './context-setup.schemas';

@Injectable()
export class ListContextResourcesTool implements McpToolDefinition<
  z.input<typeof resourceQueryInput>
> {
  readonly name = 'list_context_resources';
  readonly description =
    'Find permitted Data Marts, Storages, Destinations and Credentials by ID or title, including unassigned resources. Optional contextId limits results to attachments. canSetContexts expresses owner/admin authority; discovery grants no assignment rights.';
  readonly zodSchema = resourceQueryInput.shape;
  readonly outputSchema = { resources: z.array(contextResourceSchema) };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CONTEXT_SETUP_FACADE) private readonly contexts: McpContextSetupFacade
  ) {}
  async handler(input: z.input<typeof resourceQueryInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    return jsonToolResult({
      resources: await this.contexts.listResources(actor, resourceQueryInput.parse(input)),
    });
  }
}
