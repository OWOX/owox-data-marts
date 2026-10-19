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
import { pluginReferenceInput, pluginConfigurationSchema } from './plugin-setup.schemas';

@Injectable()
export class GetPluginConfigurationTool implements McpToolDefinition<
  z.input<typeof pluginReferenceInput>
> {
  readonly name = 'get_plugin_configuration';
  readonly description =
    'Return the actual Plugin app flow and remaining manual settings step. The Host has no explicit typed configuration contract and cannot read or verify Plugin-specific settings.';
  readonly zodSchema = pluginReferenceInput.shape;
  readonly outputSchema = { configuration: pluginConfigurationSchema };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_PLUGIN_SETUP_FACADE) private readonly plugins: McpPluginSetupFacade
  ) {}

  async handler(input: z.input<typeof pluginReferenceInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = pluginReferenceInput.parse(input);
    return jsonToolResult({
      configuration: await this.plugins.getPluginConfiguration(actor, parsed.pluginId),
    });
  }
}
