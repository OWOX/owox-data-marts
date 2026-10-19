import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_PLUGIN_SETUP_FACADE,
  type McpPluginSetupFacade,
} from '../../../../../plugin-host/facades/mcp-plugin-setup.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import { emptyPluginInput, pluginSummarySchema } from './plugin-setup.schemas';

@Injectable()
export class ListAvailablePluginsTool implements McpToolDefinition<
  z.input<typeof emptyPluginInput>
> {
  readonly name = 'list_available_plugins';
  readonly description =
    'List permitted Plugins and the current member installation history, including soft-uninstalled Plugins that may be restored through the app.';
  readonly zodSchema = emptyPluginInput.shape;
  readonly outputSchema = { plugins: z.array(pluginSummarySchema) };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_PLUGIN_SETUP_FACADE) private readonly plugins: McpPluginSetupFacade
  ) {}

  async handler(input: z.input<typeof emptyPluginInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    emptyPluginInput.parse(input);
    return jsonToolResult({ plugins: await this.plugins.listAvailablePlugins(actor) });
  }
}
