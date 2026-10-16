import type { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import {
  ActionNotDeclaredError,
  ExecutionTokenNotAllowedError,
} from '../errors/plugin-action.errors';
import { StartPluginActionExecutionService } from './start-plugin-action-execution.service';

const CONTEXT: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'user-1',
  roles: ['editor'],
  authFlow: 'plugin',
  pluginId: 'plugin-1',
  installationId: 'installation-1',
};

const VERSION = { id: 'version-1', pluginId: 'plugin-1', backend: null };
const STARTED = { id: 'execution-1', status: PluginActionExecutionStatus.RUNNING };

function setup() {
  const plugins = {
    findById: jest.fn().mockResolvedValue({ id: 'plugin-1', currentVersionId: 'version-1' }),
  };
  const versions = { findById: jest.fn().mockResolvedValue(VERSION) };
  const starter = { start: jest.fn().mockResolvedValue(STARTED) };
  const service = new StartPluginActionExecutionService(
    plugins as never,
    versions as never,
    starter as never
  );
  return { service, plugins, versions, starter };
}

describe('StartPluginActionExecutionService', () => {
  it("starts a frontend execution on the plugin's current version with the caller's role", async () => {
    const { service, starter } = setup();
    const input = { documentId: 'd1' };

    await expect(service.run({ context: CONTEXT, action: 'sync', input })).resolves.toBe(STARTED);

    expect(starter.start).toHaveBeenCalledWith({
      installation: { id: 'installation-1', projectId: 'project-1', userId: 'user-1' },
      version: VERSION,
      action: 'sync',
      input,
      role: 'editor',
      trigger: 'frontend',
    });
  });

  it('refuses a backend action starting another action', async () => {
    const { service, plugins, starter } = setup();

    await expect(
      service.run({
        context: { ...CONTEXT, executionId: 'execution-0' },
        action: 'sync',
        input: undefined,
      })
    ).rejects.toBeInstanceOf(ExecutionTokenNotAllowedError);
    expect(plugins.findById).not.toHaveBeenCalled();
    expect(starter.start).not.toHaveBeenCalled();
  });

  it.each([
    ['is not found', null],
    ['has no current version', { id: 'plugin-1', currentVersionId: null }],
  ])('refuses every action when the plugin %s', async (_label, plugin) => {
    const { service, plugins, starter } = setup();
    plugins.findById.mockResolvedValue(plugin);

    await expect(
      service.run({ context: CONTEXT, action: 'sync', input: undefined })
    ).rejects.toBeInstanceOf(ActionNotDeclaredError);
    expect(starter.start).not.toHaveBeenCalled();
  });
});
