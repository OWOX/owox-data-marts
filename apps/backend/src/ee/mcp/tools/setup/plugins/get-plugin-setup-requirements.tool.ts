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
import { pluginReferenceInput, pluginSetupSchema } from './plugin-setup.schemas';

@Injectable()
export class GetPluginSetupRequirementsTool implements McpToolDefinition<
  z.input<typeof pluginReferenceInput>
> {
  readonly name = 'get_plugin_setup_requirements';
  readonly description =
    'Read stored requirements for a permitted direct Plugin reference, current-member installation state and actual app approval/settings steps. Does not approve installation.';
  readonly zodSchema = pluginReferenceInput.shape;
  readonly outputSchema = { setup: pluginSetupSchema };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_PLUGIN_SETUP_FACADE) private readonly plugins: McpPluginSetupFacade
  ) {}

  async handler(input: z.input<typeof pluginReferenceInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = pluginReferenceInput.parse(input);
    return jsonToolResult({ setup: await this.plugins.getPluginSetup(actor, parsed.pluginId) });
  }
}
