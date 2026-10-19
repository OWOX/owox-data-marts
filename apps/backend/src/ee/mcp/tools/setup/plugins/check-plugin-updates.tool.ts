import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import type { z } from 'zod-v4';
import {
  MCP_PLUGIN_SETUP_FACADE,
  type McpPluginSetupFacade,
} from '../../../../../plugin-host/facades/mcp-plugin-setup.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import { pluginReferenceInput, pluginUpdateSchema } from './plugin-setup.schemas';

@Injectable()
export class CheckPluginUpdatesTool implements McpToolDefinition<
  z.input<typeof pluginReferenceInput>
> {
  readonly name = 'check_plugin_updates';
  readonly description =
    'Request the managed update check. A newer valid version may become current for every installation in every project. Suspension is preserved; personal version selection and pinning are unavailable.';
  readonly zodSchema = pluginReferenceInput.shape;
  readonly outputSchema = { update: pluginUpdateSchema };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_PLUGIN_SETUP_FACADE) private readonly plugins: McpPluginSetupFacade
  ) {}

  async handler(input: z.input<typeof pluginReferenceInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'live');
    const parsed = pluginReferenceInput.parse(input);
    return jsonToolResult({
      update: await this.plugins.checkPluginUpdates(actor, parsed.pluginId),
    });
  }
}
