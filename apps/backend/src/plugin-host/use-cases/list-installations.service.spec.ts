import { AuthorizationContext } from '../../idp/types/auth.types';
import { ListInstallationsCommand } from '../dto/domain/list-installations.command';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { ListInstallationsService } from './list-installations.service';

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

const plugin = (overrides = {}) => ({
  id: 'p1',
  repoOwner: 'OWOX',
  repoName: 'example',
  repoHtmlUrl: 'https://github.com/OWOX/example',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  isPrivateRepo: false,
  currentVersionId: 'v1',
  suspendedAt: null,
  ...overrides,
});

function setup(rows: unknown[] = [installation()], pluginOverrides = {}) {
  const installations = {
    findByMember: jest.fn().mockResolvedValue(rows),
    findById: jest.fn().mockResolvedValue(rows[0] ?? null),
  } as unknown as jest.Mocked<PluginInstallationService>;

  const pluginService = {
    findByIds: jest.fn().mockResolvedValue([plugin(pluginOverrides)]),
  } as unknown as jest.Mocked<PluginService>;

  const versionService = {
    findByIds: jest.fn().mockResolvedValue([
      {
        id: 'v1',
        semver: '1.0.0',
        displayName: 'Example',
        description: 'x',
        deliveryUrl: 'https://plugin.example.com',
      },
    ]),
  } as unknown as jest.Mocked<PluginVersionService>;

  const publications = {
    findVisibleTo: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<PluginPublicationService>;

  return {
    service: new ListInstallationsService(
      installations,
      pluginService,
      versionService,
      new PluginPresentationMapper(),
      publications
    ),
    installations,
    pluginService,
    publications,
  };
}

const list = (service: ListInstallationsService, includeUninstalled: boolean) =>
  service.run(new ListInstallationsCommand(MEMBER, includeUninstalled));

describe('ListInstallationsService', () => {
  describe('history', () => {
    it('hides removed installations unless history is asked for', async () => {
      const s = setup([installation({ uninstalledAt: new Date('2026-07-02') })]);

      expect(await list(s.service, false)).toHaveLength(0);
      expect(await list(s.service, true)).toHaveLength(1);
    });

    // History is the only route back to a plugin whose publication has been withdrawn:
    // it no longer shows up in the Gallery at all.
    it('reports a removed installation as restorable', async () => {
      const s = setup([installation({ uninstalledAt: new Date('2026-07-02') })]);

      const [entry] = await list(s.service, true);

      expect(entry.installationState).toBe('uninstalled');
      expect(entry.installationId).toBe('i1');
    });

    it('marks a live installation as installed', async () => {
      const [entry] = await list(setup().service, false);

      expect(entry.installationState).toBe('installed');
    });

    it('skips an installation whose plugin record has gone', async () => {
      const s = setup();
      (s.installations.findByMember as jest.Mock).mockResolvedValue([installation()]);
      const service = new ListInstallationsService(
        s.installations,
        { findByIds: jest.fn().mockResolvedValue([]) } as unknown as PluginService,
        { findByIds: jest.fn().mockResolvedValue([]) } as unknown as PluginVersionService,
        new PluginPresentationMapper(),
        s.publications
      );

      await expect(list(service, true)).resolves.toEqual([]);
    });
  });

  it('reports why each installed plugin is listed for the member, and nothing for an unlisted one', async () => {
    const s = setup([
      installation(),
      installation({ id: 'i2', pluginId: 'p2', uninstalledAt: new Date('2026-07-02') }),
    ]);
    (s.pluginService.findByIds as jest.Mock).mockResolvedValue([plugin(), plugin({ id: 'p2' })]);
    (s.publications.findVisibleTo as jest.Mock).mockResolvedValue([
      { pluginId: 'p1', scope: PluginPublicationScope.DEPLOYMENT },
      { pluginId: 'p1', scope: PluginPublicationScope.MEMBER },
      { pluginId: 'p3', scope: PluginPublicationScope.PROJECT },
    ]);

    const [listed, unlisted] = await list(s.service, true);

    expect(s.publications.findVisibleTo).toHaveBeenCalledTimes(1);
    expect(s.publications.findVisibleTo).toHaveBeenCalledWith('j1', 'u1');
    expect([...listed.visibleViaScopes].sort()).toEqual(['deployment', 'member']);
    expect(unlisted.pluginId).toBe('p2');
    expect(unlisted.visibleViaScopes).toEqual([]);
  });
});
