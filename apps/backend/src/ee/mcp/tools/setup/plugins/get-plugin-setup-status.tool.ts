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
export class GetPluginSetupStatusTool implements McpToolDefinition<
  z.input<typeof pluginReferenceInput>
> {
  readonly name = 'get_plugin_setup_status';
  readonly description =
    'Read stored Plugin setup and credential binding readiness for the current member/project. Provider validity and Plugin-specific configuration remain unverified; no external work runs.';
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
