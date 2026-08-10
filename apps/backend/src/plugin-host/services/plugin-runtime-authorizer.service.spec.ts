import { AuthorizationError } from '@owox/idp-protocol';
import type { PluginInstallationLookupPort } from '../facades/plugin-installation-lookup.facade';
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
    return {
      installations,
      service: new PluginRuntimeAuthorizerService(installations),
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

  it.each([
    ['missing', null],
    ['inactive', { ...identity, isActive: false, isSuspended: false }],
    ['suspended', { ...identity, isActive: true, isSuspended: true }],
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
});
