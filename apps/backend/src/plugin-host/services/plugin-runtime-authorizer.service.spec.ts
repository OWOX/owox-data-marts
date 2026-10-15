import { AuthorizationError } from '@owox/idp-protocol';
import type { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginSuspendedError } from '../errors/plugin-host.errors';
import type { PluginInstallationLookupPort } from '../facades/plugin-installation-lookup.facade';
import { hashExecutionToken } from '../utils/execution-token.util';
import type { PluginActionExecutionService } from './plugin-action-execution.service';
import { PluginRuntimeAuthorizerService } from './plugin-runtime-authorizer.service';

describe('PluginRuntimeAuthorizerService', () => {
  const identity = {
    installationId: 'installation-1',
    pluginId: 'plugin-1',
    projectId: 'project-1',
    userId: 'user-1',
  };

  const createService = () => {
    const installations = {
      findSnapshot: jest.fn(),
    } as unknown as jest.Mocked<PluginInstallationLookupPort>;
    const executions = {
      findRunningByTokenHash: jest.fn(),
    } as unknown as jest.Mocked<PluginActionExecutionService>;
    return {
      installations,
      executions,
      service: new PluginRuntimeAuthorizerService(installations, executions),
    };
  };

  it('accepts claims that exactly match an active, available installation', async () => {
    const { service, installations } = createService();
    installations.findSnapshot.mockResolvedValue({
      ...identity,
      isActive: true,
      isSuspended: false,
    });

    await expect(service.assertActiveInstallation(identity)).resolves.toBeUndefined();
  });

  it('answers a suspended plugin with its own code, so the plugin can say what happened', async () => {
    const { service, installations } = createService();
    installations.findSnapshot.mockResolvedValue({
      ...identity,
      isActive: true,
      isSuspended: true,
    });

    const refusal = await service
      .assertActiveInstallation(identity)
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(PluginSuspendedError);
    expect(refusal).toMatchObject({
      code: 'PLUGIN_SUSPENDED',
      errorDetails: { pluginId: 'plugin-1' },
    });
  });

  it.each([
    ['missing', null],
    ['inactive', { ...identity, isActive: false, isSuspended: false }],
    ['inactive and suspended', { ...identity, isActive: false, isSuspended: true }],
    [
      'suspended, of another plugin',
      { ...identity, pluginId: 'plugin-2', isActive: true, isSuspended: true },
    ],
    ['other plugin', { ...identity, pluginId: 'plugin-2', isActive: true, isSuspended: false }],
    ['other project', { ...identity, projectId: 'project-2', isActive: true, isSuspended: false }],
    ['other user', { ...identity, userId: 'user-2', isActive: true, isSuspended: false }],
  ])('rejects %s installation state', async (_case, snapshot) => {
    const { service, installations } = createService();
    installations.findSnapshot.mockResolvedValue(snapshot);

    await expect(service.assertActiveInstallation(identity)).rejects.toBeInstanceOf(
      AuthorizationError
    );
  });

  describe('resolveExecutionToken', () => {
    const running = {
      ...identity,
      id: 'execution-1',
      role: 'editor',
    } as PluginActionExecution;

    it('finds the running execution by the hash of its token', async () => {
      const { service, executions } = createService();
      executions.findRunningByTokenHash.mockResolvedValue(running);

      await expect(service.resolveExecutionToken('execution-token')).resolves.toEqual({
        ...identity,
        executionId: 'execution-1',
        role: 'editor',
      });
      expect(executions.findRunningByTokenHash).toHaveBeenCalledWith(
        hashExecutionToken('execution-token'),
        expect.any(Date)
      );
    });

    it('answers null when no running execution has the token', async () => {
      const { service, executions } = createService();
      executions.findRunningByTokenHash.mockResolvedValue(null);

      await expect(service.resolveExecutionToken('execution-token')).resolves.toBeNull();
    });

    it('answers null for a stored role the IDP does not know', async () => {
      const { service, executions } = createService();
      executions.findRunningByTokenHash.mockResolvedValue({ ...running, role: 'owner' });

      await expect(service.resolveExecutionToken('execution-token')).resolves.toBeNull();
    });

    it('does not look up an empty token', async () => {
      const { service, executions } = createService();

      await expect(service.resolveExecutionToken('')).resolves.toBeNull();
      expect(executions.findRunningByTokenHash).not.toHaveBeenCalled();
    });
  });
});
