import type {
  PluginSetupMutationDto,
  PluginSetupMutationRequest,
  PluginUninstallRequest,
} from '../dto/domain/mcp-plugin-mutation.dto';
import type {
  McpPluginConfigurationDto,
  McpPluginSetupActor,
  McpPluginSetupDto,
  McpPluginSummaryDto,
  McpPluginUpdateDto,
} from '../dto/domain/mcp-plugin-setup.dto';

export const MCP_PLUGIN_SETUP_FACADE = Symbol('MCP_PLUGIN_SETUP_FACADE');

export interface McpPluginSetupFacade {
  installPlugin(request: PluginSetupMutationRequest): Promise<PluginSetupMutationDto>;
  updatePluginSetup(request: PluginSetupMutationRequest): Promise<PluginSetupMutationDto>;
  uninstallPlugin(request: PluginUninstallRequest): Promise<PluginSetupMutationDto>;
  listAvailablePlugins(actor: McpPluginSetupActor): Promise<McpPluginSummaryDto[]>;
  getPluginSetup(actor: McpPluginSetupActor, pluginId: string): Promise<McpPluginSetupDto>;
  getPluginConfiguration(
    actor: McpPluginSetupActor,
    pluginId: string
  ): Promise<McpPluginConfigurationDto>;
  checkPluginUpdates(actor: McpPluginSetupActor, pluginId: string): Promise<McpPluginUpdateDto>;
}
