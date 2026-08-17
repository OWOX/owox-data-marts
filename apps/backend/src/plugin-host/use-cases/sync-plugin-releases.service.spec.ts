import { ConfigService } from '@nestjs/config';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { SyncPluginReleasesCommand } from '../dto/domain/plugin-sync.dto';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import {
  InvalidRepoLocatorError,
  PluginSyncInProgressError,
  PluginSyncLeaseLostError,
} from '../errors/plugin-host.errors';
import { GithubApiService } from '../services/github-api.service';
import { PluginService } from '../services/plugin.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { RemoteUrlValidatorService } from '../services/remote-url-validator.service';
import { SyncPluginReleasesService } from './sync-plugin-releases.service';

const LOCATOR = 'OWOX/example-plugin';

const repo = (overrides: Record<string, unknown> = {}) => ({
  githubRepoId: '987654321',
  owner: 'OWOX',
  name: 'example-plugin',
  isPrivate: false,
  htmlUrl: 'https://github.com/OWOX/example-plugin',
  accessMode: GithubAccessMode.ANONYMOUS,
  ...overrides,
});

const release = (tag: string, overrides: Record<string, unknown> = {}) => ({
  githubReleaseId: `id-${tag}`,
  tagName: tag,
  isDraft: false,
  isPrerelease: false,
  publishedAt: new Date('2026-07-01T00:00:00Z'),
  ...overrides,
});

const MANIFEST = JSON.stringify({
  name: 'Example Plugin',
  description: 'What this plugin does',
  delivery: { type: 'remote', url: 'https://plugin.example.com' },
});

function setup() {
  const githubApi = {
    getRepo: jest.fn().mockResolvedValue(repo()),
    listReleases: jest.fn().mockResolvedValue([]),
    resolveCommitSha: jest.fn().mockResolvedValue('sha-default'),
    getFileAtCommit: jest.fn().mockResolvedValue(MANIFEST),
  } as unknown as jest.Mocked<GithubApiService>;

  const validator = {
    validate: jest.fn().mockResolvedValue({ ok: true, finalUrl: 'https://plugin.example.com' }),
  } as unknown as jest.Mocked<RemoteUrlValidatorService>;

  const pluginService = {
    findByGithubRepoId: jest
      .fn()
      .mockResolvedValue({ id: 'p1', repoOwner: 'OWOX', repoName: 'example-plugin' }),
    createForRepo: jest.fn(),
    createOrFindForRepo: jest.fn(),
    syncRepoNaming: jest.fn().mockResolvedValue(undefined),
    tryClaimSyncSlot: jest.fn().mockResolvedValue({ status: 'claimed', leaseId: 'lease-1' }),
    releaseSyncSlot: jest.fn().mockResolvedValue(undefined),
    saveSyncOutcome: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<PluginService>;

  const versionService = {
    findBySemver: jest.fn().mockResolvedValue(null),
    findAllByPluginId: jest.fn().mockResolvedValue([]),
    insertVersionForLease: jest.fn(input => Promise.resolve({ id: `v-${input.semver}`, ...input })),
  } as unknown as jest.Mocked<PluginVersionService>;

  const configService = { get: () => undefined } as unknown as ConfigService;
  const config = new PluginHostConfigService(configService, new PublicOriginService(configService));

  const service = new SyncPluginReleasesService(
    githubApi,
    validator,
    pluginService,
    versionService,
    config
  );

  return { service, githubApi, validator, pluginService, versionService };
}

const run = (s: ReturnType<typeof setup>, requireCurrentVersion = true) =>
  s.service.run(new SyncPluginReleasesCommand(LOCATOR, requireCurrentVersion));

describe('SyncPluginReleasesService', () => {
  describe('sync lease fencing', () => {
    it('does not record a version after the worker loses its lease', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0')]);
      s.versionService.insertVersionForLease.mockResolvedValue(null);

      await expect(run(s)).rejects.toBeInstanceOf(PluginSyncLeaseLostError);
      expect(s.pluginService.saveSyncOutcome).not.toHaveBeenCalled();
      expect(s.pluginService.releaseSyncSlot).toHaveBeenCalledWith('p1', 'lease-1');
    });

    it('does not promote a version after the worker loses its lease', async () => {
      const s = setup();
      s.pluginService.saveSyncOutcome.mockResolvedValue(false);

      await expect(run(s)).rejects.toBeInstanceOf(PluginSyncLeaseLostError);
      expect(s.pluginService.releaseSyncSlot).toHaveBeenCalledWith('p1', 'lease-1');
    });

    it('does not disguise an unexpected insert failure as a version conflict', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0')]);
      s.versionService.insertVersionForLease.mockRejectedValue(new Error('database unavailable'));

      await expect(run(s)).rejects.toThrow('database unavailable');
    });
  });

  describe('identity and immutability', () => {
    it('resolves a renamed repository to the same plugin instead of creating a second one', async () => {
      const s = setup();
      s.githubApi.getRepo.mockResolvedValue(repo({ owner: 'NewOrg', name: 'renamed' }));

      await run(s);

      expect(s.pluginService.createOrFindForRepo).not.toHaveBeenCalled();
      expect(s.pluginService.syncRepoNaming).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ owner: 'NewOrg', name: 'renamed' })
      );
    });

    it('creates a plugin the first time a repository is seen', async () => {
      const s = setup();
      s.pluginService.findByGithubRepoId.mockResolvedValue(null);
      s.pluginService.createOrFindForRepo.mockResolvedValue({ id: 'p-new' } as never);

      const result = await run(s);

      expect(result.pluginId).toBe('p-new');
      expect(s.pluginService.syncRepoNaming).not.toHaveBeenCalled();
    });

    // A moved tag must never rewrite history: the recorded commit is the whole point of
    // pinning a version to one.
    it('refuses to mutate a recorded version when the tag moved to another commit', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.2.0')]);
      s.versionService.findBySemver.mockResolvedValue({
        id: 'v1',
        semver: '1.2.0',
        commitSha: 'aaa',
        githubReleaseId: 'id-v1.2.0',
      } as never);
      s.githubApi.resolveCommitSha.mockResolvedValue('bbb');

      const result = await run(s);

      expect(s.versionService.insertVersionForLease).not.toHaveBeenCalled();
      expect(result.report.rejections).toEqual([
        expect.objectContaining({
          code: ReleaseRejectionCode.VERSION_CONFLICT,
          detail: expect.stringContaining('aaa'),
        }),
      ]);
    });

    // §4.2 rejects reuse of a SemVer with a different Release *or* commit. Comparing only
    // the commit would let a deleted-and-recreated Release slip through as unchanged.
    it('refuses a re-cut release even when the commit is identical', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.2.0')]);
      s.versionService.findBySemver.mockResolvedValue({
        id: 'v1',
        semver: '1.2.0',
        commitSha: 'sha-default',
        githubReleaseId: 'id-old-release',
      } as never);

      const result = await run(s);

      expect(s.versionService.insertVersionForLease).not.toHaveBeenCalled();
      expect(result.report.rejections[0].code).toBe(ReleaseRejectionCode.VERSION_CONFLICT);
    });

    it('is idempotent when nothing changed', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.2.0')]);
      s.versionService.findBySemver.mockResolvedValue({
        id: 'v1',
        semver: '1.2.0',
        commitSha: 'sha-default',
        githubReleaseId: 'id-v1.2.0',
      } as never);

      const result = await run(s);

      expect(s.githubApi.getFileAtCommit).not.toHaveBeenCalled();
      expect(s.versionService.insertVersionForLease).not.toHaveBeenCalled();
      expect(result.report.unchangedSemvers).toEqual(['1.2.0']);
      expect(result.report.rejections).toEqual([]);
    });
  });

  describe('current version selection', () => {
    it('never lets an invalid release displace a working current version', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0'), release('v2.0.0')]);
      s.githubApi.getFileAtCommit.mockImplementation((_ref, _path, sha) =>
        Promise.resolve(sha === 'sha-2.0.0' ? '{"name":""}' : MANIFEST)
      );
      s.githubApi.resolveCommitSha.mockImplementation((_ref, tag) =>
        Promise.resolve(`sha-${String(tag).replace('v', '')}`)
      );
      s.versionService.findAllByPluginId.mockResolvedValue([
        { id: 'v-1.0.0', semver: '1.0.0' },
      ] as never);

      const result = await run(s);

      expect(result.currentSemver).toBe('1.0.0');
      expect(s.versionService.insertVersionForLease).toHaveBeenCalledTimes(1);
      expect(result.report.rejections[0].code).toBe(ReleaseRejectionCode.MANIFEST_SCHEMA);
    });

    it('activates the highest valid semver', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([
        release('v1.9.0'),
        release('v1.10.0'),
        release('v2.0.0'),
      ]);
      s.versionService.findAllByPluginId.mockResolvedValue([
        { id: 'a', semver: '1.9.0' },
        { id: 'b', semver: '1.10.0' },
        { id: 'c', semver: '2.0.0' },
      ] as never);

      const result = await run(s);

      expect(result.currentSemver).toBe('2.0.0');
      expect(s.pluginService.saveSyncOutcome).toHaveBeenCalledWith(
        'p1',
        'c',
        expect.anything(),
        'lease-1'
      );
    });

    // Nothing pins an installation to a version, so recording anything below the newest
    // valid release spends GitHub calls on a row that can never become current.
    it('stops at the newest valid release instead of walking the rest', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([
        release('v1.0.0'),
        release('v1.1.0'),
        release('v2.0.0'),
      ]);

      const result = await run(s);

      expect(result.report.acceptedSemvers).toEqual(['2.0.0']);
      expect(s.versionService.insertVersionForLease).toHaveBeenCalledTimes(1);
      expect(s.githubApi.resolveCommitSha).toHaveBeenCalledTimes(1);
      expect(s.githubApi.resolveCommitSha).toHaveBeenCalledWith(expect.anything(), 'v2.0.0');
    });

    // A broken newest release must not hide the one below it.
    it('falls through to the next release down when the newest is rejected', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0'), release('v2.0.0')]);
      s.githubApi.getFileAtCommit.mockImplementation(() =>
        s.githubApi.getFileAtCommit.mock.calls.length === 1
          ? Promise.resolve('not json')
          : Promise.resolve(MANIFEST)
      );

      const result = await run(s);

      expect(result.report.acceptedSemvers).toEqual(['1.0.0']);
      expect(result.report.rejections.map(r => r.tagName)).toContain('v2.0.0');
    });

    // Guards against a lexical sort sneaking back in.
    it('orders 1.10.0 above 1.9.0', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.9.0'), release('v1.10.0')]);
      s.versionService.findAllByPluginId.mockResolvedValue([
        { id: 'a', semver: '1.9.0' },
        { id: 'b', semver: '1.10.0' },
      ] as never);

      expect((await run(s)).currentSemver).toBe('1.10.0');
    });

    it('leaves the current version null when a plugin has no eligible release at all', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0', { isDraft: true })]);

      const result = await run(s);

      expect(result.currentSemver).toBeNull();
      expect(result.currentVersionId).toBeNull();
    });
  });

  describe('eligibility', () => {
    it('rejects ineligible releases without spending a single network call', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([
        release('v1.0.0', { isDraft: true }),
        release('v2.0.0', { isPrerelease: true }),
        release('v3.0.0-rc.1'),
        release('v4.0.0+build.7'),
        release('release-5'),
      ]);

      const result = await run(s);

      expect(s.githubApi.resolveCommitSha).not.toHaveBeenCalled();
      expect(result.report.rejections.map(r => r.code)).toEqual([
        ReleaseRejectionCode.DRAFT,
        ReleaseRejectionCode.PRERELEASE_FLAG,
        ReleaseRejectionCode.PRERELEASE_TAG,
        ReleaseRejectionCode.BUILD_METADATA_TAG,
        ReleaseRejectionCode.INVALID_TAG,
      ]);
    });

    it('rejects a tag that no longer resolves to a commit', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0')]);
      s.githubApi.resolveCommitSha.mockResolvedValue(null);

      const result = await run(s);

      expect(result.report.rejections[0].code).toBe(ReleaseRejectionCode.COMMIT_UNRESOLVABLE);
      expect(s.githubApi.getFileAtCommit).not.toHaveBeenCalled();
    });

    it('rejects a release with no manifest at its commit', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0')]);
      s.githubApi.getFileAtCommit.mockResolvedValue(null);

      const result = await run(s);

      expect(result.report.rejections[0].code).toBe(ReleaseRejectionCode.MANIFEST_MISSING);
      expect(s.validator.validate).not.toHaveBeenCalled();
    });

    it('rejects a release whose delivery url fails validation', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0')]);
      s.validator.validate.mockResolvedValue({
        ok: false,
        code: ReleaseRejectionCode.IFRAME_BLOCKED,
        detail: 'X-Frame-Options: DENY',
      });

      const result = await run(s);

      expect(result.report.rejections[0].code).toBe(ReleaseRejectionCode.IFRAME_BLOCKED);
      expect(s.versionService.insertVersionForLease).not.toHaveBeenCalled();
    });

    it('records what it accepted, with the exact commit', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0')]);

      const result = await run(s);

      expect(s.versionService.insertVersionForLease).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginId: 'p1',
          semver: '1.0.0',
          commitSha: 'sha-default',
          githubReleaseId: 'id-v1.0.0',
          displayName: 'Example Plugin',
          deliveryUrl: 'https://plugin.example.com',
          collections: [],
        }),
        'lease-1'
      );
      expect(result.report.acceptedSemvers).toEqual(['1.0.0']);
    });

    // The collection-compatibility gate is temporarily off; see the ponytail note in
    // processCandidate. A release that redefines an existing collection must publish.
    it('accepts a release that redefines a collection from the current manifest', async () => {
      const s = setup();
      // The reported case: a patch release binds an already-released collection to an entity.
      const boundDashboards = {
        name: 'dashboards',
        scope: 'project',
        entityBinding: {
          type: 'data-mart',
          actions: { read: 'SEE', create: 'SEE', update: 'EDIT', delete: 'DELETE' },
        },
      };
      s.githubApi.listReleases.mockResolvedValue([release('v0.1.1')]);
      s.githubApi.getFileAtCommit.mockResolvedValue(
        JSON.stringify({ ...JSON.parse(MANIFEST), collections: [boundDashboards] })
      );
      s.versionService.findAllByPluginId.mockResolvedValue([
        {
          id: 'v1',
          semver: '0.1.0',
          collections: [{ name: 'dashboards', scope: 'project' }],
        },
      ] as never);

      const result = await run(s);

      expect(result.report.rejections).toEqual([]);
      expect(result.report.acceptedSemvers).toEqual(['0.1.1']);
      expect(s.versionService.insertVersionForLease).toHaveBeenCalledWith(
        expect.objectContaining({ collections: [boundDashboards] }),
        'lease-1'
      );
    });

    // One broken release must not take the good ones down with it.
    it('keeps accepting good releases alongside a rejected one', async () => {
      const s = setup();
      s.githubApi.listReleases.mockResolvedValue([release('v1.0.0'), release('bad-tag')]);
      s.versionService.findAllByPluginId.mockResolvedValue([{ id: 'a', semver: '1.0.0' }] as never);

      const result = await run(s);

      expect(result.report.acceptedSemvers).toEqual(['1.0.0']);
      expect(result.report.rejections).toHaveLength(1);
      expect(result.currentSemver).toBe('1.0.0');
    });
  });

  describe('throttling', () => {
    const stored = {
      syncedAt: '2026-07-01T00:00:00.000Z',
      accessMode: GithubAccessMode.ANONYMOUS,
      acceptedSemvers: ['1.0.0'],
      unchangedSemvers: [],
      rejections: [],
    };

    it.each([
      [GithubAccessMode.APP, 30_000],
      [GithubAccessMode.SERVER_TOKEN, 30_000],
      [GithubAccessMode.ANONYMOUS, 300_000],
    ])('uses the safe cooldown for %s access', async (accessMode, intervalMs) => {
      const s = setup();
      s.githubApi.getRepo.mockResolvedValue(repo({ accessMode }));

      await run(s);

      expect(s.pluginService.tryClaimSyncSlot).toHaveBeenCalledWith('p1', intervalMs);
    });

    it('publishes with the stored validated version when only the cooldown blocks sync', async () => {
      const s = setup();
      s.pluginService.tryClaimSyncSlot.mockResolvedValue({
        status: 'rate_limited',
        retryAfterSeconds: 42,
        state: { pluginId: 'p1', currentVersionId: 'v1', lastSyncReport: stored },
      } as never);
      s.versionService.findById = jest.fn().mockResolvedValue({ id: 'v1', semver: '1.0.0' });

      const result = await run(s);

      expect(s.githubApi.listReleases).not.toHaveBeenCalled();
      expect(result.report).toEqual(stored);
      expect(result.currentSemver).toBe('1.0.0');
      expect(result.throttled).toBe(true);
    });

    it('reports the remaining cooldown when no validated version exists', async () => {
      const s = setup();
      s.pluginService.tryClaimSyncSlot.mockResolvedValue({
        status: 'rate_limited',
        retryAfterSeconds: 42,
        state: { pluginId: 'p1', currentVersionId: null, lastSyncReport: null },
      } as never);

      await expect(run(s)).rejects.toMatchObject({
        code: 'PLUGIN_SYNC_RATE_LIMITED',
        errorDetails: { retryAfterSeconds: 42 },
      });
    });

    it('reports an active publication instead of treating it as cooldown', async () => {
      const s = setup();
      s.pluginService.tryClaimSyncSlot.mockResolvedValue({
        status: 'in_progress',
        state: { pluginId: 'p1', currentVersionId: null, lastSyncReport: null },
      } as never);

      await expect(run(s)).rejects.toBeInstanceOf(PluginSyncInProgressError);
    });

    it('does not use a cached version while another sync is still running', async () => {
      const s = setup();
      s.pluginService.tryClaimSyncSlot.mockResolvedValue({
        status: 'in_progress',
        state: { pluginId: 'p1', currentVersionId: 'v1', lastSyncReport: stored },
      } as never);
      s.versionService.findById = jest.fn().mockResolvedValue({ id: 'v1', semver: '1.0.0' });

      await expect(run(s)).rejects.toBeInstanceOf(PluginSyncInProgressError);
    });

    it('returns an empty throttled state for a background sweep during the first sync', async () => {
      const s = setup();
      s.pluginService.tryClaimSyncSlot.mockResolvedValue({
        status: 'in_progress',
        state: { pluginId: 'p1', currentVersionId: null, lastSyncReport: null },
      } as never);

      const result = await run(s, false);

      expect(s.githubApi.listReleases).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        currentSemver: null,
        currentVersionId: null,
        report: {
          accessMode: GithubAccessMode.ANONYMOUS,
          acceptedSemvers: [],
          unchangedSemvers: [],
          rejections: [],
        },
        throttled: true,
      });
    });

    it('returns the stored report unchanged for a background sweep', async () => {
      const s = setup();
      s.pluginService.tryClaimSyncSlot.mockResolvedValue({
        status: 'rate_limited',
        retryAfterSeconds: 42,
        state: { pluginId: 'p1', currentVersionId: 'v1', lastSyncReport: stored },
      } as never);
      s.versionService.findById = jest.fn().mockResolvedValue({ id: 'v1', semver: '1.0.0' });

      const result = await run(s, false);

      expect(s.githubApi.listReleases).not.toHaveBeenCalled();
      expect(result.report).toEqual(stored);
      expect(result.currentSemver).toBe('1.0.0');
    });
  });

  it('rejects a locator that is not a github repository before touching the network', async () => {
    const s = setup();

    await expect(
      s.service.run(new SyncPluginReleasesCommand('https://gitlab.com/a/b'))
    ).rejects.toBeInstanceOf(InvalidRepoLocatorError);
    expect(s.githubApi.getRepo).not.toHaveBeenCalled();
  });
});
