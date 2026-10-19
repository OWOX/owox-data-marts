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
import { pluginMutationInput, pluginMutationSchema } from './plugin-setup.schemas';

@Injectable()
export class InstallPluginTool implements McpToolDefinition<z.input<typeof pluginMutationInput>> {
  readonly name = 'install_plugin';
  readonly description =
    'Prepare current-member Plugin review in the app, then recover its authenticated completion. Requires current shared version and installation revision; model approval is not accepted.';
  readonly zodSchema = pluginMutationInput.shape;
  readonly outputSchema = { result: pluginMutationSchema };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_PLUGIN_SETUP_FACADE) private readonly plugins: McpPluginSetupFacade
  ) {}
  async handler(input: z.input<typeof pluginMutationInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = pluginMutationInput.parse(input);
    return jsonToolResult({ result: await this.plugins.installPlugin({ ...actor, ...parsed }) });
  }
}
