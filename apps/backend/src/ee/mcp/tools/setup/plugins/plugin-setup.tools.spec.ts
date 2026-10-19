import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import type { IdpProjectionsFacade } from '../../../../../idp/facades/idp-projections.facade';
import type { McpPluginSetupFacade } from '../../../../../plugin-host/facades/mcp-plugin-setup.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import type { McpToolDefinition } from '../../mcp-tool.definition';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { ListAvailablePluginsTool } from './list-available-plugins.tool';
import { GetPluginSetupRequirementsTool } from './get-plugin-setup-requirements.tool';
import { GetPluginSetupStatusTool } from './get-plugin-setup-status.tool';
import { GetPluginConfigurationTool } from './get-plugin-configuration.tool';
import { ConfigurePluginTool } from './configure-plugin.tool';
import { CheckPluginUpdatesTool } from './check-plugin-updates.tool';

const pluginId = '243dab94-bd94-4f5d-9447-7337bf04b477';
const context = {
  userId: 'member-1',
  projectId: 'project-1',
  roles: ['admin'],
  scopes: ['mcp:read', 'mcp:write'],
} as McpAuthContext;
const configuration = {
  pluginId,
  mode: 'app',
  verification: 'unknown',
  appUrl: `https://selfhost.test/ui/project-1/plugins/${pluginId}/open`,
  manualStep: 'Complete Plugin settings in the app; Host verification is unavailable.',
};

function setup() {
  const projectLookup = jest.fn().mockResolvedValue({ id: context.projectId, roles: ['editor'] });
  const authorization = new SetupAuthorizationService({
    getProjectForUser: projectLookup,
  } as unknown as IdpProjectionsFacade);
  const facade = {
    listAvailablePlugins: jest.fn().mockResolvedValue([]),
    getPluginSetup: jest.fn().mockResolvedValue({
      plugin: {
        pluginId,
        displayName: 'Plugin',
        description: '',
        currentVersionId: 'v1',
        currentSemver: '1.0.0',
        installationState: 'installed',
        suspended: false,
        detailsUrl: configuration.appUrl,
      },
      installation: null,
      requirements: [],
      credentials: null,
      readiness: 'configuration_unverified',
      configuration,
      approval: { status: 'required_in_app', appUrl: configuration.appUrl },
    }),
    getPluginConfiguration: jest.fn().mockResolvedValue(configuration),
    checkPluginUpdates: jest.fn().mockResolvedValue({
      pluginId,
      currentVersionId: 'v2',
      currentSemver: '2.0.0',
      outcome: 'updated',
      nextCheckAt: null,
      sharedDeploymentEffect: true,
      effect: 'Shared deployment update',
    }),
  };
  const typed = facade as unknown as McpPluginSetupFacade;
  const tools: (McpToolDefinition & {
    outputSchema: NonNullable<McpToolDefinition['outputSchema']>;
  })[] = [
    new ListAvailablePluginsTool(authorization, typed),
    new GetPluginSetupRequirementsTool(authorization, typed),
    new GetPluginSetupStatusTool(authorization, typed),
    new GetPluginConfigurationTool(authorization, typed),
    new ConfigurePluginTool(authorization, typed),
    new CheckPluginUpdatesTool(authorization, typed),
  ];
  return { tools, facade, projectLookup };
}

describe('Plugin setup handlers', () => {
  it('uses current actor fields and strict output contracts for every implemented tool', async () => {
    const { tools, facade } = setup();
    for (const tool of tools) {
      const result = await tool.handler(
        tool.name === 'list_available_plugins' ? {} : { pluginId },
        context
      );
      expect(z.object(tool.outputSchema).strict().safeParse(result.structuredContent).success).toBe(
        true
      );
    }
    expect(facade.getPluginSetup).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'member-1', roles: ['editor'] },
      pluginId
    );
    expect(facade.checkPluginUpdates).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'member-1', roles: ['editor'] },
      pluginId
    );
  });

  it('rechecks current membership on every direct invocation before domain work', async () => {
    const { tools, facade, projectLookup } = setup();
    projectLookup.mockResolvedValue({ id: context.projectId, roles: ['viewer'] });
    for (const tool of tools) {
      await expect(
        tool.handler(tool.name === 'list_available_plugins' ? {} : { pluginId }, context)
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    for (const method of Object.values(facade)) expect(method).not.toHaveBeenCalled();
  });

  it('requires read scope for metadata and both scopes for live checks and configuration handoff', async () => {
    const { tools, facade } = setup();
    for (const tool of tools) {
      const input = tool.name === 'list_available_plugins' ? {} : { pluginId };
      await expect(
        tool.handler(input, { ...context, scopes: ['mcp:write'] })
      ).rejects.toBeInstanceOf(ForbiddenException);
      if (tool.name === 'check_plugin_updates' || tool.name === 'configure_plugin') {
        expect(tool.requiredScopes).toEqual(['mcp:read', 'mcp:write']);
        await expect(
          tool.handler(input, { ...context, scopes: ['mcp:read'] })
        ).rejects.toBeInstanceOf(ForbiddenException);
      } else {
        expect(tool.requiredScopes).toEqual(['mcp:read']);
      }
    }
    for (const method of Object.values(facade)) expect(method).not.toHaveBeenCalled();
  });

  it('rejects model actor, secret, arbitrary settings and version-pin input on direct calls', async () => {
    const { tools, facade } = setup();
    for (const tool of tools) {
      const input = tool.name === 'list_available_plugins' ? {} : { pluginId };
      for (const extra of [
        { userId: 'other' },
        { secret: 'key' },
        { settings: {} },
        { expectedVersionId: 'v1' },
      ]) {
        await expect(tool.handler({ ...input, ...extra } as never, context)).rejects.toThrow();
      }
    }
    for (const method of Object.values(facade)) expect(method).not.toHaveBeenCalled();
  });

  it('propagates stored read errors instead of manufacturing empty success', async () => {
    const { tools, facade } = setup();
    facade.listAvailablePlugins.mockRejectedValue(new Error('Storage unavailable'));
    await expect(tools[0].handler({}, context)).rejects.toThrow('Storage unavailable');
  });
});
