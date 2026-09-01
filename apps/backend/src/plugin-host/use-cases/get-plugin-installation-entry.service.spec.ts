import { NotFoundException } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { GetPluginInstallationEntryCommand } from '../dto/domain/get-plugin-installation-entry.command';
import { PluginSuspendedError } from '../errors/plugin-host.errors';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { GetPluginInstallationEntryService } from './get-plugin-installation-entry.service';

const MEMBER = { projectId: 'j1', userId: 'u1' } as AuthorizationContext;

const installation = (overrides = {}) => ({
  id: 'i1',
  pluginId: 'p1',
  projectId: 'j1',
  userId: 'u1',
  installedAt: new Date('2026-07-01'),
  uninstalledAt: null,
  ...overrides,
});

function setup(row: unknown = installation(), pluginOverrides = {}) {
  const installations = {
    findById: jest.fn().mockResolvedValue(row),
  } as unknown as jest.Mocked<PluginInstallationService>;

  const pluginService = {
    findById: jest.fn().mockResolvedValue({
      id: 'p1',
      repoOwner: 'OWOX',
      repoName: 'example',
      repoHtmlUrl: 'https://github.com/OWOX/example',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      isPrivateRepo: false,
      currentVersionId: 'v1',
      suspendedAt: null,
      ...pluginOverrides,
    }),
  } as unknown as jest.Mocked<PluginService>;

  const versionService = {
    findById: jest.fn().mockResolvedValue({
      id: 'v1',
      semver: '1.0.0',
      displayName: 'Example',
      description: 'x',
      deliveryUrl: 'https://plugin.example.com',
      credentialRequirements: [],
    }),
  } as unknown as jest.Mocked<PluginVersionService>;

  const credentialBindings = {
    assertConsumerReady: jest.fn().mockResolvedValue([]),
  };

  return {
    service: new GetPluginInstallationEntryService(
      installations,
      pluginService,
      versionService,
      credentialBindings as never
    ),
    installations,
    credentialBindings,
  };
}

const entry = (service: GetPluginInstallationEntryService) =>
  service.run(new GetPluginInstallationEntryCommand('i1', MEMBER));

describe('GetPluginInstallationEntryService', () => {
  it("returns the delivery url for the caller's own live installation", async () => {
    const state = setup();
    await expect(entry(state.service)).resolves.toEqual({
      deliveryUrl: 'https://plugin.example.com',
      displayName: 'Example',
      pluginId: 'p1',
      versionId: 'v1',
      credentialHandles: [],
    });
    expect(state.credentialBindings.assertConsumerReady).toHaveBeenCalledWith(
      expect.objectContaining({ consumerId: 'i1', requirements: [] })
    );
  });

  it('returns capability-scoped handles and omits optional requirements without a binding', async () => {
    const state = setup();
    state.credentialBindings.assertConsumerReady.mockResolvedValue([
      { key: 'github', definitionId: 'github', optional: false, models: [] },
      {
        key: 'ai',
        definitionId: null,
        optional: false,
        models: ['fast', 'embedding'],
      },
    ]);

    await expect(entry(state.service)).resolves.toMatchObject({
      credentialHandles: [
        { name: 'github', kind: 'exact' },
        { name: 'ai', kind: 'ai', models: ['fast', 'embedding'] },
      ],
    });
  });

  // One 404 for every way of not being entitled: confirming that an installation
  // exists but belongs to someone else is itself a disclosure.
  it.each([
    ['another member', installation({ userId: 'u2' })],
    ['another project', installation({ projectId: 'j2' })],
    ['a removed installation', installation({ uninstalledAt: new Date() })],
  ])('refuses %s with a plain not found', async (_label, row) => {
    await expect(entry(setup(row).service)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a suspended plugin distinctly, so the host can explain why', async () => {
    await expect(
      entry(setup(installation(), { suspendedAt: new Date() }).service)
    ).rejects.toBeInstanceOf(PluginSuspendedError);
  });
});
