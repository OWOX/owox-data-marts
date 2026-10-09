import { BadRequestException } from '@nestjs/common';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { GithubRepoNotFoundError } from '../errors/plugin-host.errors';
import { ExternalCredentialDefinitionSyncService } from './external-credential-definition-sync.service';
import { GithubApiService } from './github-api.service';
import { PluginVersionService } from './plugin-version.service';
import { ReleaseCandidateRulesService } from './release-candidate-rules.service';
import { RemoteUrlValidatorService } from './remote-url-validator.service';

const MANIFEST = {
  name: 'Example Plugin',
  description: 'What this plugin does',
  delivery: { type: 'remote', url: 'https://plugin.example.com' },
};

const CANDIDATE = {
  pluginId: 'p1',
  ref: { owner: 'OWOX', name: 'example-plugin' },
  commitSha: 'sha-1',
  semver: '1.1.0',
};

const DASHBOARDS_V1 = {
  id: 'v1',
  semver: '1.0.0',
  collections: [{ name: 'dashboards', scope: 'project' }],
};

function setup(manifest: string | null = JSON.stringify(MANIFEST), versions: unknown[] = []) {
  const githubApi = {
    getFileAtCommit: jest.fn().mockResolvedValue(manifest),
  } as unknown as jest.Mocked<GithubApiService>;
  const validator = {
    validate: jest.fn().mockResolvedValue({ ok: true, finalUrl: 'https://plugin.example.com' }),
  } as unknown as jest.Mocked<RemoteUrlValidatorService>;
  const versionService = {
    findAllByPluginId: jest.fn().mockResolvedValue(versions),
  } as unknown as jest.Mocked<PluginVersionService>;

  return {
    rules: new ReleaseCandidateRulesService(githubApi, validator, versionService),
    githubApi,
    validator,
    versionService,
  };
}

describe('ReleaseCandidateRulesService.collectAll', () => {
  it('reports only the manifest issue when plugin.json is invalid', async () => {
    const s = setup('{ not json', [DASHBOARDS_V1]);

    const report = await s.rules.collectAll(CANDIDATE);

    expect(report.issues).toEqual([
      { code: ReleaseRejectionCode.MANIFEST_INVALID_JSON, detail: expect.any(String) },
    ]);
    expect(report).toMatchObject({
      baselineSemver: '1.0.0',
      collectionsEvaluated: false,
    });
    expect(s.validator.validate).not.toHaveBeenCalled();
  });

  it('reports incompatible collections and an unreachable delivery URL together', async () => {
    const s = setup(JSON.stringify(MANIFEST), [DASHBOARDS_V1]);
    s.validator.validate.mockResolvedValue({
      ok: false,
      code: ReleaseRejectionCode.URL_UNREACHABLE,
      detail: 'https://plugin.example.com did not respond',
    });

    const report = await s.rules.collectAll(CANDIDATE);

    expect(report.issues).toEqual([
      {
        code: ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
        detail:
          'Collection "dashboards" cannot be removed within the 1.0.0 compatibility line; publish a new major version to ship this breaking change',
      },
      {
        code: ReleaseRejectionCode.URL_UNREACHABLE,
        detail: 'https://plugin.example.com did not respond',
      },
    ]);
    expect(report.collectionsEvaluated).toBe(true);
  });

  it('reports no issues for a passing candidate', async () => {
    const s = setup(JSON.stringify({ ...MANIFEST, collections: DASHBOARDS_V1.collections }), [
      DASHBOARDS_V1,
    ]);

    const report = await s.rules.collectAll(CANDIDATE);

    expect(report).toEqual({
      issues: [],
      baselineSemver: '1.0.0',
      collectionsEvaluated: true,
    });
    expect(s.githubApi.getFileAtCommit).toHaveBeenCalledWith(CANDIDATE.ref, 'plugin.json', 'sha-1');
  });

  it('skips the collection rule when no recorded version shares the candidate line', async () => {
    const s = setup(JSON.stringify(MANIFEST), [{ ...DASHBOARDS_V1, id: 'v2', semver: '2.0.0' }]);

    const report = await s.rules.collectAll(CANDIDATE);

    expect(report.issues).toEqual([]);
    expect(report).toMatchObject({ baselineSemver: null, collectionsEvaluated: false });
  });

  it('evaluates the other rules without a baseline when the candidate has no version', async () => {
    const s = setup(JSON.stringify(MANIFEST), [DASHBOARDS_V1]);
    s.validator.validate.mockResolvedValue({
      ok: false,
      code: ReleaseRejectionCode.URL_UNREACHABLE,
      detail: 'https://plugin.example.com did not respond',
    });

    const report = await s.rules.collectAll({ ...CANDIDATE, semver: null });

    expect(report.issues).toEqual([
      {
        code: ReleaseRejectionCode.URL_UNREACHABLE,
        detail: 'https://plugin.example.com did not respond',
      },
    ]);
    expect(report).toMatchObject({
      baselineSemver: null,
      collectionsEvaluated: false,
    });
    expect(s.versionService.findAllByPluginId).not.toHaveBeenCalled();
  });

  describe('with an external Credential definition', () => {
    const CREDENTIAL_MANIFEST = JSON.stringify({
      name: 'Acme Credentials',
      description: '',
      delivery: { type: 'credential-definition' },
      credential: {
        name: 'acme',
        authentication: {
          type: 'secret',
          label: 'API key',
          placement: { type: 'header', name: 'authorization', scheme: 'Bearer' },
        },
        origins: ['https://api.acme.example'],
      },
    });

    function setupExternal() {
      const s = setup(JSON.stringify({ ...MANIFEST, credentials: ['@acme/credentials'] }));
      const credentialGithub = {
        getRepo: jest
          .fn()
          .mockResolvedValue({ githubRepoId: '123', owner: 'acme', name: 'credentials' }),
        listReleases: jest.fn().mockResolvedValue([
          {
            githubReleaseId: 'release-1',
            tagName: 'v1.0.0',
            isDraft: false,
            isPrerelease: false,
            publishedAt: new Date(),
          },
        ]),
        resolveCommitSha: jest.fn().mockResolvedValue('c'.repeat(40)),
        getFileAtCommit: jest.fn().mockResolvedValue(CREDENTIAL_MANIFEST),
      };
      const registry = {
        register: jest.fn(),
        reschedule: jest.fn(),
        preview: jest.fn().mockResolvedValue({ contract: { id: 'acme' } }),
        getCurrentByGithubRepoId: jest.fn().mockResolvedValue(null),
      };
      const rules = new ReleaseCandidateRulesService(
        s.githubApi,
        s.validator,
        s.versionService,
        new ExternalCredentialDefinitionSyncService(credentialGithub as never, registry as never)
      );
      return { rules, registry, credentialGithub, validator: s.validator };
    }

    it('previews it without writing to the Credential registry', async () => {
      const s = setupExternal();

      const report = await s.rules.collectAll(CANDIDATE);

      expect(report.issues).toEqual([]);
      expect(s.registry.preview).toHaveBeenCalledWith(
        expect.objectContaining({ githubRepoId: '123', semver: '1.0.0' })
      );
      expect(s.registry.register).not.toHaveBeenCalled();
      expect(s.registry.reschedule).not.toHaveBeenCalled();
    });

    it('lists a rejected definition as MANIFEST_SCHEMA with the detail sync records', async () => {
      const s = setupExternal();
      const rejection = new BadRequestException(
        'Credential definition 1.0.0 changes an incompatible contract within compatibility line 1; publish a new compatibility line for this change'
      );
      s.registry.preview.mockRejectedValue(rejection);
      s.registry.register.mockRejectedValue(rejection);

      const report = await s.rules.collectAll(CANDIDATE);
      const verdict = await s.rules.firstFailure(CANDIDATE);

      expect(report.issues).toEqual([
        {
          code: ReleaseRejectionCode.MANIFEST_SCHEMA,
          detail:
            '1.0.0: Credential definition 1.0.0 changes an incompatible contract within compatibility line 1; publish a new compatibility line for this change',
        },
      ]);
      expect(verdict).toEqual({ ok: false, ...report.issues[0] });
    });

    it('lists an unreadable Credential repository as MANIFEST_SCHEMA and keeps the other issues', async () => {
      const s = setupExternal();
      s.credentialGithub.getRepo.mockRejectedValue(
        new GithubRepoNotFoundError('acme', 'credentials')
      );
      s.validator.validate.mockResolvedValue({
        ok: false,
        code: ReleaseRejectionCode.URL_UNREACHABLE,
        detail: 'https://plugin.example.com did not respond',
      });

      const report = await s.rules.collectAll(CANDIDATE);

      expect(report.issues).toEqual([
        {
          code: ReleaseRejectionCode.URL_UNREACHABLE,
          detail: 'https://plugin.example.com did not respond',
        },
        {
          code: ReleaseRejectionCode.MANIFEST_SCHEMA,
          detail: '@acme/credentials: GitHub repository acme/credentials was not found',
        },
      ]);
    });
  });
});
