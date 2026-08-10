import { AuthorizationContext } from '../../idp/types/auth.types';
import { GetPluginGalleryCommand } from '../dto/domain/get-plugin-gallery.command';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { GetPluginGalleryService } from './get-plugin-gallery.service';

const CONTEXT = { projectId: 'j1', userId: 'u1' } as AuthorizationContext;
const COMMAND = new GetPluginGalleryCommand(CONTEXT);

const publication = (scope: PluginPublicationScope, pluginId = 'p1') => ({ scope, pluginId });

const plugin = (id: string, overrides = {}) => ({
  id,
  repoOwner: 'OWOX',
  repoName: `repo-${id}`,
  repoHtmlUrl: `https://github.com/OWOX/repo-${id}`,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  isPrivateRepo: false,
  currentVersionId: `v-${id}`,
  suspendedAt: null,
  ...overrides,
});

function setup() {
  const publications = {
    findVisibleTo: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<PluginPublicationService>;

  const pluginService = {
    findByIds: jest.fn((ids: string[]) => Promise.resolve(ids.map(id => plugin(id)))),
  } as unknown as jest.Mocked<PluginService>;

  const versionService = {
    findByIds: jest.fn((ids: string[]) =>
      Promise.resolve(ids.map(id => ({ id, semver: '1.0.0', displayName: 'Example' })))
    ),
  } as unknown as jest.Mocked<PluginVersionService>;

  const installations = {
    findByMember: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<PluginInstallationService>;

  return {
    service: new GetPluginGalleryService(
      publications,
      installations,
      pluginService,
      versionService,
      new PluginPresentationMapper()
    ),
    publications,
    installations,
    pluginService,
    versionService,
  };
}

describe('GetPluginGalleryService', () => {
  it('is empty when nothing is published to this member', async () => {
    const s = setup();

    await expect(s.service.run(COMMAND)).resolves.toEqual([]);
  });

  it('asks only for what is visible to this member in this project', async () => {
    const s = setup();

    await s.service.run(COMMAND);

    expect(s.publications.findVisibleTo).toHaveBeenCalledWith('j1', 'u1');
  });

  // Three authority levels exposing one plugin is one entry, not three. §10 is explicit
  // that there is no precedence and no substitution between them.
  it('collapses several publications of one plugin into a single entry', async () => {
    const s = setup();
    s.publications.findVisibleTo.mockResolvedValue([
      publication(PluginPublicationScope.DEPLOYMENT),
      publication(PluginPublicationScope.PROJECT),
      publication(PluginPublicationScope.MEMBER),
    ] as never);

    const gallery = await s.service.run(COMMAND);

    expect(gallery).toHaveLength(1);
    expect(gallery[0].visibleViaScopes.sort()).toEqual(['deployment', 'member', 'project']);
  });

  it('keeps distinct plugins apart', async () => {
    const s = setup();
    s.publications.findVisibleTo.mockResolvedValue([
      publication(PluginPublicationScope.DEPLOYMENT, 'p1'),
      publication(PluginPublicationScope.MEMBER, 'p2'),
    ] as never);

    const gallery = await s.service.run(COMMAND);

    expect(gallery.map(entry => entry.pluginId).sort()).toEqual(['p1', 'p2']);
  });

  it('loads each plugin once however many publications point at it', async () => {
    const s = setup();
    s.publications.findVisibleTo.mockResolvedValue([
      publication(PluginPublicationScope.DEPLOYMENT),
      publication(PluginPublicationScope.PROJECT),
    ] as never);

    await s.service.run(COMMAND);

    expect(s.pluginService.findByIds).toHaveBeenCalledWith(['p1']);
  });

  // Hiding it would leave a member wondering where an installed plugin went; §12 says
  // the Gallery keeps showing it, marked unavailable.
  it('still lists a suspended plugin, marked unavailable', async () => {
    const s = setup();
    s.publications.findVisibleTo.mockResolvedValue([
      publication(PluginPublicationScope.DEPLOYMENT),
    ] as never);
    s.pluginService.findByIds.mockResolvedValue([
      plugin('p1', { suspendedAt: new Date() }),
    ] as never);

    const [entry] = await s.service.run(COMMAND);

    expect(entry.suspended).toBe(true);
  });

  it('never returns publisher diagnostics', async () => {
    const s = setup();
    s.publications.findVisibleTo.mockResolvedValue([
      publication(PluginPublicationScope.DEPLOYMENT),
    ] as never);

    const [entry] = await s.service.run(COMMAND);

    expect(Object.keys(entry)).not.toContain('deliveryUrl');
    expect(Object.keys(entry)).not.toContain('commitSha');
  });

  it('skips a publication whose plugin record has gone missing rather than failing the page', async () => {
    const s = setup();
    s.publications.findVisibleTo.mockResolvedValue([
      publication(PluginPublicationScope.DEPLOYMENT),
    ] as never);
    s.pluginService.findByIds.mockResolvedValue([]);

    await expect(s.service.run(COMMAND)).resolves.toEqual([]);
  });

  // The comment above findByMember argues against per-row lookups; this holds the
  // plugin and version reads to the same rule.
  it('reads plugins and versions in one query each, however long the list', async () => {
    const s = setup();
    s.publications.findVisibleTo.mockResolvedValue([
      publication(PluginPublicationScope.DEPLOYMENT, 'p1'),
      publication(PluginPublicationScope.PROJECT, 'p2'),
      publication(PluginPublicationScope.DEPLOYMENT, 'p3'),
    ] as never);

    const entries = await s.service.run(COMMAND);

    expect(entries).toHaveLength(3);
    expect(s.pluginService.findByIds).toHaveBeenCalledTimes(1);
    expect(s.versionService.findByIds).toHaveBeenCalledTimes(1);
  });
});
