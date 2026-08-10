import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginService } from '../services/plugin.service';
import { PluginInstallationLookupFacade } from './plugin-installation-lookup.facade.impl';

describe('PluginInstallationLookupFacade', () => {
  function setup(options: {
    installation?: {
      id: string;
      pluginId: string;
      projectId: string;
      userId: string;
      uninstalledAt: Date | null;
    } | null;
    plugin?: { id: string; suspendedAt: Date | null } | null;
  }) {
    const installations = {
      findById: jest.fn().mockResolvedValue(options.installation ?? null),
    } as unknown as jest.Mocked<PluginInstallationService>;

    const plugins = {
      findById: jest
        .fn()
        .mockResolvedValue('plugin' in options ? options.plugin : { id: 'p1', suspendedAt: null }),
    } as unknown as jest.Mocked<PluginService>;

    return {
      facade: new PluginInstallationLookupFacade(installations, plugins),
      installations,
      plugins,
    };
  }

  it('returns null when the installation does not exist', async () => {
    const { facade } = setup({ installation: null });

    await expect(facade.findSnapshot('missing')).resolves.toBeNull();
  });

  it('reports an active installation', async () => {
    const { facade } = setup({
      installation: {
        id: 'i1',
        pluginId: 'p1',
        projectId: 'j1',
        userId: 'u1',
        uninstalledAt: null,
      },
    });

    await expect(facade.findSnapshot('i1')).resolves.toEqual({
      installationId: 'i1',
      pluginId: 'p1',
      projectId: 'j1',
      userId: 'u1',
      isActive: true,
      isSuspended: false,
    });
  });

  it('reports a soft-uninstalled installation as inactive rather than absent', async () => {
    const { facade } = setup({
      installation: {
        id: 'i1',
        pluginId: 'p1',
        projectId: 'j1',
        userId: 'u1',
        uninstalledAt: new Date('2026-07-01'),
      },
    });

    await expect(facade.findSnapshot('i1')).resolves.toMatchObject({
      isActive: false,
      isSuspended: false,
    });
  });

  it('reports suspension so runtime authorization can refuse the plugin', async () => {
    const { facade } = setup({
      installation: {
        id: 'i1',
        pluginId: 'p1',
        projectId: 'j1',
        userId: 'u1',
        uninstalledAt: null,
      },
      plugin: { id: 'p1', suspendedAt: new Date('2026-07-01') },
    });

    await expect(facade.findSnapshot('i1')).resolves.toMatchObject({ isSuspended: true });
  });

  // Fail closed: a missing plugin record must not look healthy to runtime auth.
  it('treats a missing plugin record as suspended', async () => {
    const { facade } = setup({
      installation: {
        id: 'i1',
        pluginId: 'p1',
        projectId: 'j1',
        userId: 'u1',
        uninstalledAt: null,
      },
      plugin: null,
    });

    await expect(facade.findSnapshot('i1')).resolves.toMatchObject({ isSuspended: true });
  });
});
