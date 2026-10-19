import type { McpPluginSetupActor } from './mcp-plugin-setup.dto';

export interface PluginSetupMutationRequest extends McpPluginSetupActor {
  pluginId: string;
  operationId: string;
  expectedRevision: number;
  expectedVersionId: string;
  approvalId?: string;
}
export interface PluginUninstallRequest extends McpPluginSetupActor {
  pluginId: string;
  operationId: string;
  expectedRevision: number;
}
export interface PluginSetupMutationDto {
  state: 'app_required' | 'completed' | 'incomplete';
  pluginId: string;
  installationId: string | null;
  revision: number;
  approvalId: string | null;
  appUrl: string | null;
}
