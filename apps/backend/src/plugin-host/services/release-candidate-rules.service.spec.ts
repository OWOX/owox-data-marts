import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
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
      manifest: null,
      credentialRequirements: null,
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
      manifest: expect.objectContaining({ name: 'Example Plugin' }),
      credentialRequirements: [],
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
      manifest: expect.objectContaining({ name: 'Example Plugin' }),
      credentialRequirements: [],
      baselineSemver: null,
      collectionsEvaluated: false,
    });
    expect(s.versionService.findAllByPluginId).not.toHaveBeenCalled();
  });
});
