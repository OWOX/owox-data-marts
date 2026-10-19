import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { InstallPluginTool } from './install-plugin.tool';
import { UpdatePluginSetupTool } from './update-plugin-setup.tool';
import { UninstallPluginTool } from './uninstall-plugin.tool';

const input = {
  pluginId: '243dab94-bd94-4f5d-9447-7337bf04b477',
  operationId: 'install-1',
  expectedRevision: 0,
  expectedVersionId: 'e1644e0c-b087-4b99-b025-66eb3be3b448',
};
const context = {
  projectId: 'project',
  userId: 'member',
  roles: ['admin'],
  scopes: ['mcp:read', 'mcp:write'],
};
function fixture() {
  const lookup = jest.fn().mockResolvedValue({ id: 'project', roles: ['editor'] });
  const authorization = new SetupAuthorizationService({ getProjectForUser: lookup } as never);
  const result = {
    state: 'app_required',
    pluginId: input.pluginId,
    installationId: null,
    revision: 0,
    approvalId: 'review',
    appUrl: 'https://app.test/review',
  };
  const facade = {
    installPlugin: jest.fn().mockResolvedValue(result),
    updatePluginSetup: jest.fn().mockResolvedValue(result),
    uninstallPlugin: jest
      .fn()
      .mockResolvedValue({ ...result, state: 'completed', appUrl: null, approvalId: null }),
  };
  return {
    lookup,
    facade,
    tools: [
      new InstallPluginTool(authorization, facade as never),
      new UpdatePluginSetupTool(authorization, facade as never),
      new UninstallPluginTool(authorization, facade as never),
    ],
  };
}
describe('Plugin mutation tools', () => {
  it('passes server current actor and validates every result', async () => {
    const { facade, tools } = fixture();
    for (const tool of tools) {
      const parsed =
        tool.name === 'uninstall_plugin'
          ? { pluginId: input.pluginId, operationId: input.operationId, expectedRevision: 0 }
          : input;
      const result = await tool.handler(parsed as never, context as never);
      expect(z.object(tool.outputSchema).strict().safeParse(result.structuredContent).success).toBe(
        true
      );
    }
    expect(facade.installPlugin).toHaveBeenCalledWith({
      ...input,
      projectId: 'project',
      userId: 'member',
      roles: ['editor'],
    });
  });
  it('rejects stale authority and model approval, actor or secrets', async () => {
    const { lookup, facade, tools } = fixture();
    for (const tool of tools) {
      const parsed =
        tool.name === 'uninstall_plugin'
          ? { pluginId: input.pluginId, operationId: input.operationId, expectedRevision: 0 }
          : input;
      for (const extra of [{ approved: true }, { userId: 'other' }, { secret: 'value' }])
        await expect(
          tool.handler({ ...parsed, ...extra } as never, context as never)
        ).rejects.toThrow();
      lookup.mockResolvedValueOnce({ id: 'project', roles: ['viewer'] });
      await expect(tool.handler(parsed as never, context as never)).rejects.toBeInstanceOf(
        ForbiddenException
      );
    }
    for (const fn of Object.values(facade)) expect(fn).not.toHaveBeenCalled();
  });
});
