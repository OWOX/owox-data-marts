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
import { pluginUninstallInput, pluginMutationSchema } from './plugin-setup.schemas';

@Injectable()
export class UninstallPluginTool implements McpToolDefinition<
  z.input<typeof pluginUninstallInput>
> {
  readonly name = 'uninstall_plugin';
  readonly description =
    'Soft uninstall only the current member Plugin installation, including suspended Plugins. Preserves history and other members; requires a current revision and stable operation ID.';
  readonly zodSchema = pluginUninstallInput.shape;
  readonly outputSchema = { result: pluginMutationSchema };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_PLUGIN_SETUP_FACADE) private readonly plugins: McpPluginSetupFacade
  ) {}
  async handler(input: z.input<typeof pluginUninstallInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = pluginUninstallInput.parse(input);
    return jsonToolResult({ result: await this.plugins.uninstallPlugin({ ...actor, ...parsed }) });
  }
}
