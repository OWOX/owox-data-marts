import { PluginVersion } from '../entities/plugin-version.entity';
import { Plugin } from '../entities/plugin.entity';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPresentationMapper } from './plugin-presentation.mapper';

const plugin = (overrides: Partial<Plugin> = {}): Plugin =>
  ({
    id: 'p1',
    githubRepoId: '42',
    repoOwner: 'OWOX',
    repoName: 'example-plugin',
    repoHtmlUrl: 'https://github.com/OWOX/example-plugin',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    isPrivateRepo: false,
    currentVersionId: 'v1',
    suspendedAt: null,
    ...overrides,
  }) as Plugin;

const version = (overrides: Partial<PluginVersion> = {}): PluginVersion =>
  ({
    id: 'v1',
    semver: '1.2.3',
    commitSha: 'abc123',
    displayName: 'Example Plugin',
    description: 'What this plugin does',
    deliveryUrl: 'https://plugin.example.com',
    ...overrides,
  }) as PluginVersion;

const mapper = new PluginPresentationMapper();

const memberView = (p = plugin(), v: PluginVersion | null = version()) =>
  mapper.toMemberDto(p, v, {
    scopes: [PluginPublicationScope.DEPLOYMENT],
    installationState: 'not_installed',
  });

describe('PluginPresentationMapper', () => {
  describe('member view', () => {
    it('carries what the Gallery needs', () => {
      expect(memberView()).toMatchObject({
        pluginId: 'p1',
        displayName: 'Example Plugin',
        description: 'What this plugin does',
        currentSemver: '1.2.3',
        visibleViaScopes: [PluginPublicationScope.DEPLOYMENT],
        suspended: false,
        installationState: 'not_installed',
      });
    });

    // Asserted on keys, not values: a `deliveryUrl: undefined` property still serializes
    // as a leak the day someone changes the serializer.
    it.each(['deliveryUrl', 'commitSha', 'repoOwner', 'repoName', 'lastSyncReport', 'accessMode'])(
      'never exposes %s',
      key => {
        expect(Object.keys(memberView())).not.toContain(key);
      }
    );

    it('discloses owner, repository and a link for a public repository', () => {
      expect(memberView().source).toEqual({
        ownerName: 'OWOX',
        ownerUrl: 'https://github.com/OWOX',
        repositoryUrl: 'https://github.com/OWOX/example-plugin',
      });
    });

    // Naming the repository would tell a member that a specific private repository
    // exists, which is exactly what §16 withholds.
    it('discloses only the owner for a private repository', () => {
      const source = memberView(plugin({ isPrivateRepo: true })).source;

      expect(source).toEqual({ ownerName: 'OWOX', ownerUrl: 'https://github.com/OWOX' });
      expect(Object.keys(source)).not.toContain('repositoryUrl');
    });

    it('reports suspension so the Gallery can mark it unavailable rather than hide it', () => {
      expect(memberView(plugin({ suspendedAt: new Date() })).suspended).toBe(true);
    });

    it('survives a plugin with no eligible version yet', () => {
      const view = memberView(plugin({ currentVersionId: null }), null);

      expect(view.currentSemver).toBeNull();
      expect(view.displayName).toBe('example-plugin');
      expect(view.description).toBe('');
    });

    // The name fallback must not hand back what `source` withholds one field above.
    it('falls back to the owner rather than the repository name for a private repository', () => {
      const view = memberView(plugin({ currentVersionId: null, isPrivateRepo: true }), null);

      expect(view.displayName).toBe('OWOX');
      expect(view.displayName).not.toBe('example-plugin');
    });
  });

  // Publisher diagnostics reach a publisher through the diagnostics block on a
  // publication response, never through a second flavour of the plugin view -- so there
  // is no view-building entry point that could be told which audience to serve.
  it('builds only member views', () => {
    expect('toPublisherDto' in mapper).toBe(false);
    expect(mapper.toMemberDto).toHaveLength(3);
  });
});
