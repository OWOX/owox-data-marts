import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { IdpProvider } from '@owox/idp-protocol';
import type { IdpProviderService } from '../../idp/services/idp-provider.service';
import type { PluginInstallationLookupPort } from '../facades/plugin-installation-lookup.facade';
import { PluginSuspendedError } from '../errors/plugin-host.errors';
import { IssuePluginRuntimeTokenService } from './issue-plugin-runtime-token.service';

describe('IssuePluginRuntimeTokenService', () => {
  const context = { projectId: 'project-1', userId: 'user-1' };
  const snapshot = {
    installationId: 'installation-1',
    pluginId: 'plugin-1',
    projectId: 'project-1',
    userId: 'user-1',
    isActive: true,
    isSuspended: false,
  };

  const createService = () => {
    const installations = {
      findSnapshot: jest.fn(),
    } as unknown as jest.Mocked<PluginInstallationLookupPort>;
    const provider = {
      issueAccessTokenForPluginRuntime: jest.fn(),
    } as unknown as jest.Mocked<IdpProvider>;
    const idpProviderService = {
      getProviderFromApp: jest.fn(() => provider),
    } as unknown as jest.Mocked<IdpProviderService>;

    return {
      installations,
      provider,
      service: new IssuePluginRuntimeTokenService(installations, idpProviderService),
    };
  };

  it('issues an access-only token tied to the requested installation', async () => {
    const { service, installations, provider } = createService();
    installations.findSnapshot.mockResolvedValue(snapshot);
    provider.issueAccessTokenForPluginRuntime.mockResolvedValue({
      accessToken: 'plugin-runtime-access-token',
      accessTokenExpiresIn: 900,
      refreshToken: 'must-not-be-returned',
    });

    await expect(service.run('installation-1', context)).resolves.toEqual({
      runtimeToken: 'plugin-runtime-access-token',
      expiresIn: 900,
    });
    expect(provider.issueAccessTokenForPluginRuntime).toHaveBeenCalledWith(
      'plugin-1',
      'installation-1',
      'user-1',
      'project-1'
    );
  });

  it.each([
    ['missing', null],
    ['inactive', { ...snapshot, isActive: false }],
    ['other project', { ...snapshot, projectId: 'project-2' }],
    ['other member', { ...snapshot, userId: 'user-2' }],
  ])('hides a %s installation behind the same not-found response', async (_case, value) => {
    const { service, installations, provider } = createService();
    installations.findSnapshot.mockResolvedValue(value);

    await expect(service.run('installation-1', context)).rejects.toBeInstanceOf(NotFoundException);
    expect(provider.issueAccessTokenForPluginRuntime).not.toHaveBeenCalled();
  });

  it('rejects a suspended installation without issuing a token', async () => {
    const { service, installations, provider } = createService();
    installations.findSnapshot.mockResolvedValue({ ...snapshot, isSuspended: true });

    await expect(service.run('installation-1', context)).rejects.toBeInstanceOf(
      PluginSuspendedError
    );
    expect(provider.issueAccessTokenForPluginRuntime).not.toHaveBeenCalled();
  });

  it('fails when the provider omits the access-token lifetime', async () => {
    const { service, installations, provider } = createService();
    installations.findSnapshot.mockResolvedValue(snapshot);
    provider.issueAccessTokenForPluginRuntime.mockResolvedValue({
      accessToken: 'plugin-runtime-access-token',
    });

    await expect(service.run('installation-1', context)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});
