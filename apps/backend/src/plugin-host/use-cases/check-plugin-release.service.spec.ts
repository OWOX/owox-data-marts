import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { CheckPluginReleaseCommand } from '../dto/domain/check-plugin-release.command';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import {
  GithubRepoNotAccessibleError,
  PluginCheckRateLimitedError,
} from '../errors/plugin-host.errors';
import { GithubApiService } from '../services/github-api.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { ReleaseCandidateRulesService } from '../services/release-candidate-rules.service';
import { RemoteUrlValidatorService } from '../services/remote-url-validator.service';
import { CheckPluginReleaseService } from './check-plugin-release.service';

const MEMBER = { projectId: 'j1', userId: 'u1' } as AuthorizationContext;
const PUBLISHER = { projectId: 'j1', userId: 'u1', apiKeyId: 'key-1' } as AuthorizationContext;

const MANIFEST = JSON.stringify({
  name: 'Example Plugin',
  description: 'What this plugin does',
  delivery: { type: 'remote', url: 'https://plugin.example.com' },
});

interface RecordedVersion {
  id: string;
  semver: string;
  commitSha: string;
  collections: unknown[];
}

const CURRENT: RecordedVersion = {
  id: 'v-current',
  semver: '1.4.2',
  commitSha: 'sha-old',
  collections: [],
};

function setup(
  options: {
    plugin?: Record<string, unknown> | null;
    versions?: RecordedVersion[];
    config?: Partial<PluginHostConfigService>;
  } = {}
) {
  const versions = options.versions ?? [CURRENT];
  const plugin =
    options.plugin === null
      ? null
      : {
          id: 'p1',
          repoOwner: 'OWOX',
          repoName: 'example-plugin',
          isPrivateRepo: false,
          githubRepoId: '42',
          currentVersionId: versions[0]?.id ?? null,
          ...options.plugin,
        };

  const pluginService = {
    findByRepoName: jest.fn().mockResolvedValue(plugin),
    tryClaimSyncSlot: jest.fn(),
    saveSyncOutcome: jest.fn(),
  } as unknown as jest.Mocked<PluginService>;

  const authorization = {
    isDeploymentPublisher: jest.fn(
      (context: AuthorizationContext) => context.apiKeyId === PUBLISHER.apiKeyId
    ),
  } as unknown as jest.Mocked<PublicationAuthorizationService>;

  const publications = {
    listManageable: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<PluginPublicationService>;

  const versionService = {
    findById: jest.fn((id: string) => Promise.resolve(versions.find(v => v.id === id) ?? null)),
    findBySemver: jest.fn((_pluginId: string, semver: string) =>
      Promise.resolve(versions.find(v => v.semver === semver) ?? null)
    ),
    findAllByPluginId: jest.fn().mockResolvedValue(versions),
    insertVersionForLease: jest.fn(),
  } as unknown as jest.Mocked<PluginVersionService>;

  const githubApi = {
    getRepo: jest.fn().mockResolvedValue({ githubRepoId: '42' }),
    resolveCommitSha: jest.fn().mockResolvedValue('sha-new'),
    getFileAtCommit: jest.fn().mockResolvedValue(MANIFEST),
  } as unknown as jest.Mocked<GithubApiService>;

  const validator = {
    validate: jest.fn().mockResolvedValue({ ok: true, finalUrl: 'https://plugin.example.com' }),
  } as unknown as jest.Mocked<RemoteUrlValidatorService>;

  const config = {
    isAppModeConfigured: false,
    githubToken: undefined,
    getSyncMinIntervalMs: jest.fn().mockReturnValue(300_000),
    ...options.config,
  } as unknown as jest.Mocked<PluginHostConfigService>;

  const service = new CheckPluginReleaseService(
    pluginService,
    authorization,
    publications,
    versionService,
    githubApi,
    new ReleaseCandidateRulesService(githubApi, validator, versionService),
    config
  );

  return { service, pluginService, publications, versionService, githubApi, validator, config };
}

const check = (
  s: ReturnType<typeof setup>,
  options: { context?: AuthorizationContext; ref?: string; version?: string } = {}
) =>
  s.service.run(
    new CheckPluginReleaseCommand(
      options.context ?? PUBLISHER,
      'OWOX/example-plugin',
      options.ref ?? 'main',
      options.version
    )
  );

describe('CheckPluginReleaseService', () => {
  describe('who may check', () => {
    it.each([
      ['an unknown repository', { plugin: null }, PUBLISHER],
      ['a caller with no publication rights', {}, MEMBER],
    ] as const)('answers %s with the same NotFound', async (_case, options, context) => {
      const s = setup(options);

      const attempt = check(s, { context });

      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
      await expect(attempt).rejects.toThrow(
        'Plugin OWOX/example-plugin was not found on this deployment'
      );
      expect(s.githubApi.getRepo).not.toHaveBeenCalled();
      expect(s.githubApi.resolveCommitSha).not.toHaveBeenCalled();
    });

    it('answers a repository that now has another identity with the same NotFound', async () => {
      const s = setup();
      s.githubApi.getRepo.mockResolvedValue({ githubRepoId: '43' } as never);

      const attempt = check(s);

      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
      await expect(attempt).rejects.toThrow(
        'Plugin OWOX/example-plugin was not found on this deployment'
      );
      expect(s.githubApi.getRepo).toHaveBeenCalledWith({ owner: 'OWOX', name: 'example-plugin' });
      expect(s.githubApi.resolveCommitSha).not.toHaveBeenCalled();
    });

    it('reports a repository GitHub no longer lets it read as such', async () => {
      const s = setup();
      const denied = new GithubRepoNotAccessibleError(
        'OWOX',
        'example-plugin',
        'https://github.com/apps/owox/installations/new'
      );
      s.githubApi.getRepo.mockRejectedValue(denied);

      await expect(check(s)).rejects.toBe(denied);
      expect(s.githubApi.resolveCommitSha).not.toHaveBeenCalled();
    });

    it('answers a deployment publisher', async () => {
      const s = setup({ plugin: { isPrivateRepo: true } });

      await expect(check(s)).resolves.toMatchObject({
        pluginId: 'p1',
        repository: 'OWOX/example-plugin',
        commitSha: 'sha-new',
      });
    });

    it('answers a member who manages a publication, withholding a private name', async () => {
      const s = setup({ plugin: { isPrivateRepo: true } });
      s.publications.listManageable.mockResolvedValue([{ pluginId: 'p1' }] as never);

      await expect(check(s, { context: MEMBER })).resolves.toMatchObject({
        pluginId: 'p1',
        repository: 'OWOX/***',
        commitSha: 'sha-new',
      });
    });
  });

  describe('candidate version', () => {
    it.each([
      ['0.1.2', '0.1.3'],
      ['1.4.0', '1.5.0'],
      ['1.4.2', '1.5.0'],
    ])('defaults from current %s to %s', async (current, candidate) => {
      const s = setup({ versions: [{ ...CURRENT, semver: current }] });

      await expect(check(s)).resolves.toMatchObject({
        candidateVersion: candidate,
        baselineVersion: current,
        collectionsEvaluated: true,
        issues: [],
      });
    });

    it('takes a named version without its v prefix', async () => {
      const s = setup();

      await expect(check(s, { version: 'v1.7.0' })).resolves.toMatchObject({
        candidateVersion: '1.7.0',
        baselineVersion: '1.4.2',
        collectionsEvaluated: true,
      });
    });

    it.each(['1.7.0-rc.1', '1.7.0+build.7', 'latest'])(
      'rejects the ineligible version %s before any GitHub request',
      async version => {
        const s = setup();

        await expect(check(s, { version })).rejects.toBeInstanceOf(BadRequestException);
        expect(s.githubApi.resolveCommitSha).not.toHaveBeenCalled();
        expect(s.githubApi.getFileAtCommit).not.toHaveBeenCalled();
      }
    );

    it('still evaluates the content rules when there is no version at all', async () => {
      const s = setup({ versions: [] });
      s.validator.validate.mockResolvedValue({
        ok: false,
        code: ReleaseRejectionCode.URL_UNREACHABLE,
        detail: 'https://plugin.example.com did not respond',
      });

      await expect(check(s)).resolves.toEqual({
        pluginId: 'p1',
        repository: 'OWOX/example-plugin',
        commitSha: 'sha-new',
        candidateVersion: null,
        baselineVersion: null,
        collectionsEvaluated: false,
        issues: [
          {
            code: ReleaseRejectionCode.URL_UNREACHABLE,
            detail: 'https://plugin.example.com did not respond',
          },
        ],
      });
    });

    it('has no baseline for a named version that opens a new line', async () => {
      const s = setup();

      await expect(check(s, { version: '2.0.0' })).resolves.toMatchObject({
        candidateVersion: '2.0.0',
        baselineVersion: null,
        collectionsEvaluated: false,
      });
    });
  });

  describe('issues', () => {
    it('reports an unresolvable ref and evaluates nothing else', async () => {
      const s = setup();
      s.githubApi.resolveCommitSha.mockResolvedValue(null);

      await expect(check(s, { ref: 'feature/missing' })).resolves.toEqual({
        pluginId: 'p1',
        repository: 'OWOX/example-plugin',
        commitSha: null,
        candidateVersion: '1.5.0',
        baselineVersion: null,
        collectionsEvaluated: false,
        issues: [
          {
            code: ReleaseRejectionCode.COMMIT_UNRESOLVABLE,
            detail: 'Ref feature/missing does not resolve to a commit',
          },
        ],
      });
      expect(s.githubApi.getFileAtCommit).not.toHaveBeenCalled();
    });

    it('reports a recorded named version and still evaluates the content rules', async () => {
      const s = setup();

      const result = await check(s, { version: '1.4.2' });

      expect(result.issues).toEqual([
        {
          code: ReleaseRejectionCode.VERSION_CONFLICT,
          detail: 'Version 1.4.2 is already recorded from commit sha-old',
        },
      ]);
      expect(result).toMatchObject({ baselineVersion: '1.4.2', collectionsEvaluated: true });
      expect(s.githubApi.getFileAtCommit).toHaveBeenCalledWith(
        { owner: 'OWOX', name: 'example-plugin' },
        'plugin.json',
        'sha-new'
      );
    });

    it('reports a named version below the current one and still evaluates the content rules', async () => {
      const s = setup();
      s.validator.validate.mockResolvedValue({
        ok: false,
        code: ReleaseRejectionCode.URL_UNREACHABLE,
        detail: 'https://plugin.example.com did not respond',
      });

      await expect(check(s, { version: '1.3.0' })).resolves.toMatchObject({
        candidateVersion: '1.3.0',
        baselineVersion: '1.4.2',
        collectionsEvaluated: true,
        issues: [
          {
            code: ReleaseRejectionCode.VERSION_CONFLICT,
            detail:
              'Version 1.3.0 is lower than the current version 1.4.2; release sync stops at the current version and would not record it',
          },
          {
            code: ReleaseRejectionCode.URL_UNREACHABLE,
            detail: 'https://plugin.example.com did not respond',
          },
        ],
      });
    });

    it('reports only the recorded conflict for a recorded version below the current one', async () => {
      const s = setup({
        versions: [
          CURRENT,
          { id: 'v-old', semver: '1.2.0', commitSha: 'sha-1.2', collections: [] },
        ],
      });

      await expect(check(s, { version: '1.2.0' })).resolves.toMatchObject({
        issues: [
          {
            code: ReleaseRejectionCode.VERSION_CONFLICT,
            detail: 'Version 1.2.0 is already recorded from commit sha-1.2',
          },
        ],
      });
    });

    it('does not compare a named version when there is no current version', async () => {
      const s = setup({
        versions: [{ id: 'v-old', semver: '0.9.0', commitSha: 'sha-0.9', collections: [] }],
        plugin: { currentVersionId: null },
      });

      await expect(check(s, { version: '0.1.0' })).resolves.toMatchObject({ issues: [] });
    });
  });

  it('records nothing and claims no sync slot', async () => {
    const s = setup();

    await check(s);

    expect(s.pluginService.tryClaimSyncSlot).not.toHaveBeenCalled();
    expect(s.pluginService.saveSyncOutcome).not.toHaveBeenCalled();
    expect(s.versionService.insertVersionForLease).not.toHaveBeenCalled();
  });

  describe('rate limit', () => {
    it('refuses a second check of the same plugin within the interval', async () => {
      const s = setup();
      await check(s);

      const attempt = check(s);

      await expect(attempt).rejects.toBeInstanceOf(PluginCheckRateLimitedError);
      await expect(attempt).rejects.toMatchObject({
        code: 'PLUGIN_CHECK_RATE_LIMITED',
        errorDetails: { retryAfterSeconds: 300 },
      });
      expect(s.githubApi.getRepo).toHaveBeenCalledTimes(1);
      expect(s.githubApi.resolveCommitSha).toHaveBeenCalledTimes(1);
    });

    it('limits each caller separately', async () => {
      const s = setup();
      s.publications.listManageable.mockResolvedValue([{ pluginId: 'p1' }] as never);
      await check(s, { context: PUBLISHER });

      await expect(check(s, { context: MEMBER })).resolves.toMatchObject({ pluginId: 'p1' });
      await expect(check(s, { context: MEMBER })).rejects.toBeInstanceOf(
        PluginCheckRateLimitedError
      );
    });

    it('does not spend the slot on an unauthorized caller', async () => {
      const s = setup();

      await expect(check(s, { context: MEMBER })).rejects.toBeInstanceOf(NotFoundException);
      s.publications.listManageable.mockResolvedValue([{ pluginId: 'p1' }] as never);

      await expect(check(s, { context: MEMBER })).resolves.toMatchObject({ pluginId: 'p1' });
    });

    it('allows the next check once the interval has passed', async () => {
      const s = setup({ config: { getSyncMinIntervalMs: jest.fn().mockReturnValue(0) } });
      await check(s);

      await expect(check(s)).resolves.toMatchObject({ pluginId: 'p1' });
    });

    it.each([
      [{}, GithubAccessMode.ANONYMOUS],
      [{ githubToken: 'token' }, GithubAccessMode.SERVER_TOKEN],
      [{ isAppModeConfigured: true }, GithubAccessMode.APP],
    ] as const)('uses the interval of the configured access (%o)', async (config, mode) => {
      const s = setup({ config });

      await check(s);

      expect(s.config.getSyncMinIntervalMs).toHaveBeenCalledWith(mode);
    });
  });
});
