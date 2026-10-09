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

const WITH_CREDENTIAL = JSON.stringify({ ...MANIFEST, credentials: ['@acme/credentials'] });

function setupExternal(manifest = WITH_CREDENTIAL, versions: unknown[] = []) {
  const s = setup(manifest, versions);
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
    register: jest
      .fn()
      .mockResolvedValue({ definitionId: 'definition-1', contract: { id: 'acme' } }),
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
  return { ...s, rules, registry, credentialGithub };
}

const UNREACHABLE = {
  ok: false,
  code: ReleaseRejectionCode.URL_UNREACHABLE,
  detail: 'https://plugin.example.com did not respond',
} as const;

const REJECTED_DEFINITION = new BadRequestException(
  'Credential definition 1.0.0 changes an incompatible contract within compatibility line 1; publish a new compatibility line for this change'
);

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

  it('points a 0.x plugin to a minor bump for a breaking collection change', async () => {
    const s = setup(JSON.stringify(MANIFEST), [{ ...DASHBOARDS_V1, semver: '0.3.0' }]);

    const report = await s.rules.collectAll({ ...CANDIDATE, semver: '0.3.1' });

    expect(report.issues).toEqual([
      {
        code: ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
        detail:
          'Collection "dashboards" cannot be removed within the 0.3.0 compatibility line; bump the minor version to ship this breaking change while below 1.0.0',
      },
    ]);
  });

  it('takes the highest recorded version of the candidate line as the baseline', async () => {
    const s = setup(JSON.stringify(MANIFEST), [
      { id: 'v1', semver: '1.0.0', collections: [] },
      { ...DASHBOARDS_V1, id: 'v3', semver: '1.10.0' },
      { id: 'v2', semver: '1.9.0', collections: [] },
      { ...DASHBOARDS_V1, id: 'v4', semver: '2.0.0' },
    ]);

    const report = await s.rules.collectAll({ ...CANDIDATE, semver: '1.11.0' });

    expect(report).toEqual({
      issues: [
        {
          code: ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
          detail:
            'Collection "dashboards" cannot be removed within the 1.10.0 compatibility line; publish a new major version to ship this breaking change',
        },
      ],
      baselineSemver: '1.10.0',
      collectionsEvaluated: true,
    });
  });

  it('treats each 0.x minor as its own line', async () => {
    const s = setup(JSON.stringify(MANIFEST), [
      { ...DASHBOARDS_V1, id: 'v3', semver: '0.3.0' },
      { id: 'v2', semver: '0.2.0', collections: [] },
    ]);

    const report = await s.rules.collectAll({ ...CANDIDATE, semver: '0.2.1' });

    expect(report).toEqual({ issues: [], baselineSemver: '0.2.0', collectionsEvaluated: true });
  });

  it('accepts any collections over a baseline that recorded none', async () => {
    const s = setup(JSON.stringify(MANIFEST), [{ ...DASHBOARDS_V1, collections: null }]);

    const report = await s.rules.collectAll(CANDIDATE);

    expect(report).toEqual({ issues: [], baselineSemver: '1.0.0', collectionsEvaluated: true });
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
      s.registry.preview.mockRejectedValue(REJECTED_DEFINITION);
      s.registry.register.mockRejectedValue(REJECTED_DEFINITION);

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

describe('ReleaseCandidateRulesService.firstFailure', () => {
  it.each([
    [
      'an invalid manifest',
      ReleaseRejectionCode.MANIFEST_INVALID_JSON,
      () => setupExternal('{ not json', [DASHBOARDS_V1]),
    ],
    [
      'incompatible collections',
      ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
      () => setupExternal(WITH_CREDENTIAL, [DASHBOARDS_V1]),
    ],
    [
      'an unreachable delivery URL',
      ReleaseRejectionCode.URL_UNREACHABLE,
      () => {
        const s = setupExternal();
        s.validator.validate.mockResolvedValue(UNREACHABLE);
        return s;
      },
    ],
    [
      'a rejected Credential definition',
      ReleaseRejectionCode.MANIFEST_SCHEMA,
      () => {
        const s = setupExternal();
        s.registry.preview.mockRejectedValue(REJECTED_DEFINITION);
        s.registry.register.mockRejectedValue(REJECTED_DEFINITION);
        return s;
      },
    ],
    [
      'a clean candidate',
      null,
      () =>
        setupExternal(
          JSON.stringify({
            ...MANIFEST,
            collections: DASHBOARDS_V1.collections,
            credentials: ['@acme/credentials'],
          }),
          [DASHBOARDS_V1]
        ),
    ],
    [
      'incompatible collections and an unreachable delivery URL',
      ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
      () => {
        const s = setupExternal(WITH_CREDENTIAL, [DASHBOARDS_V1]);
        s.validator.validate.mockResolvedValue(UNREACHABLE);
        return s;
      },
    ],
  ])('agrees with the check on %s', async (_case, firstCode, arrange) => {
    const report = await arrange().rules.collectAll(CANDIDATE);
    const verdict = await arrange().rules.firstFailure(CANDIDATE);

    expect(report.issues[0]?.code ?? null).toBe(firstCode);
    expect(verdict).toEqual(
      report.issues.length === 0
        ? expect.objectContaining({ ok: true })
        : { ok: false, ...report.issues[0] }
    );
  });

  it('does not validate the delivery URL after a collection failure', async () => {
    const s = setupExternal(WITH_CREDENTIAL, [DASHBOARDS_V1]);

    await expect(s.rules.firstFailure(CANDIDATE)).resolves.toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
    });
    expect(s.validator.validate).not.toHaveBeenCalled();
    expect(s.credentialGithub.getRepo).not.toHaveBeenCalled();
  });

  it('does not resolve Credentials after a delivery failure', async () => {
    const s = setupExternal();
    s.validator.validate.mockResolvedValue(UNREACHABLE);

    await expect(s.rules.firstFailure(CANDIDATE)).resolves.toEqual(UNREACHABLE);
    expect(s.credentialGithub.getRepo).not.toHaveBeenCalled();
    expect(s.registry.register).not.toHaveBeenCalled();
  });
});
