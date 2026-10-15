import { BadRequestException } from '@nestjs/common';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { GithubRepoNotFoundError } from '../errors/plugin-host.errors';
import { ActionInputValidatorService } from './action-input-validator.service';
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

// Real worker threads: ajv's refusals and the compile budget come from the pool.
const inputValidator = new ActionInputValidatorService();
afterAll(() => inputValidator.onModuleDestroy());

function setup(manifest: string | null = JSON.stringify(MANIFEST), versions: unknown[] = []) {
  const githubApi = {
    getFileAtCommit: jest.fn().mockResolvedValue(manifest),
  } as unknown as jest.Mocked<GithubApiService>;
  const validator = {
    validate: jest.fn().mockResolvedValue({ ok: true, finalUrl: 'https://plugin.example.com' }),
    checkPublicHttps: jest.fn().mockResolvedValue({ ok: true }),
  } as unknown as jest.Mocked<RemoteUrlValidatorService>;
  const versionService = {
    findAllByPluginId: jest.fn().mockResolvedValue(versions),
  } as unknown as jest.Mocked<PluginVersionService>;

  return {
    rules: new ReleaseCandidateRulesService(githubApi, validator, versionService, inputValidator),
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
    inputValidator,
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

const BACKEND = {
  url: 'https://acme-docs.acme.workers.dev/owox',
  actions: {
    'update-document': { timeoutSeconds: 60 },
    'list-documents': { timeoutSeconds: 30 },
  },
};

const BACKEND_V1 = { id: 'v1', semver: '1.0.0', collections: [], backend: BACKEND };

const withBackend = (backend: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ ...MANIFEST, ...extra, backend });

const WITHOUT_LIST = withBackend({ ...BACKEND, actions: { 'update-document': {} } });

const PRIVATE_BACKEND = {
  ok: false,
  code: ReleaseRejectionCode.URL_PRIVATE_NETWORK,
  detail: 'Unsafe URL (private-ipv4): https://10.0.0.1/owox',
} as const;

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

  describe('with backend actions', () => {
    it('reports a removed action within the compatibility line', async () => {
      const s = setup(WITHOUT_LIST, [BACKEND_V1]);

      const report = await s.rules.collectAll(CANDIDATE);

      expect(report.issues).toEqual([
        {
          code: ReleaseRejectionCode.ACTIONS_INCOMPATIBLE,
          detail:
            'Action "list-documents" cannot be removed within the 1.0.0 compatibility line; publish a new major version to ship this breaking change',
        },
      ]);
    });

    it('treats a dropped backend block as removing its actions', async () => {
      const s = setup(JSON.stringify(MANIFEST), [BACKEND_V1]);

      const report = await s.rules.collectAll(CANDIDATE);

      expect(report.issues).toEqual([
        {
          code: ReleaseRejectionCode.ACTIONS_INCOMPATIBLE,
          detail:
            'Action "update-document" cannot be removed within the 1.0.0 compatibility line; publish a new major version to ship this breaking change',
        },
      ]);
      expect(s.validator.checkPublicHttps).not.toHaveBeenCalled();
    });

    it('accepts added actions and changed timeouts', async () => {
      const s = setup(
        withBackend({
          ...BACKEND,
          actions: {
            ...BACKEND.actions,
            'update-document': { timeoutSeconds: 120 },
            'delete-document': {},
          },
        }),
        [BACKEND_V1]
      );

      await expect(s.rules.collectAll(CANDIDATE)).resolves.toMatchObject({ issues: [] });
    });

    it('refuses a backend added within the compatibility line', async () => {
      const s = setup(WITHOUT_LIST, [{ ...BACKEND_V1, backend: null }]);

      const report = await s.rules.collectAll(CANDIDATE);

      expect(report.issues).toEqual([
        {
          code: ReleaseRejectionCode.BACKEND_ORIGIN_CHANGED,
          detail:
            'A backend on https://acme-docs.acme.workers.dev cannot be added within the 1.0.0 compatibility line; publish a new major version to ship this breaking change',
        },
      ]);
    });

    it.each([
      [
        'an absolute url on another origin',
        BACKEND_V1,
        { ...BACKEND, url: 'https://other.example/owox' },
        'The backend cannot move from https://acme-docs.acme.workers.dev to https://other.example',
      ],
      [
        'a relative url that follows a moved delivery.url',
        {
          ...BACKEND_V1,
          deliveryUrl: 'https://old.example.com/app/',
          backend: { ...BACKEND, url: '/owox' },
        },
        { ...BACKEND, url: '/owox' },
        'The backend cannot move from https://old.example.com to https://plugin.example.com',
      ],
    ])('refuses %s within the compatibility line', async (_label, baseline, backend, change) => {
      const s = setup(withBackend(backend), [baseline]);

      const report = await s.rules.collectAll(CANDIDATE);

      expect(report.issues).toEqual([
        {
          code: ReleaseRejectionCode.BACKEND_ORIGIN_CHANGED,
          detail: `${change} within the 1.0.0 compatibility line; publish a new major version to ship this breaking change`,
        },
      ]);
    });

    it.each([
      [
        'a new path on the same origin',
        BACKEND_V1,
        { ...BACKEND, url: 'https://acme-docs.acme.workers.dev/v2/owox' },
      ],
      [
        'a relative url that resolves to the same origin',
        {
          ...BACKEND_V1,
          deliveryUrl: 'https://acme-docs.acme.workers.dev/app/',
          backend: { ...BACKEND, url: '/owox' },
        },
        BACKEND,
      ],
    ])('accepts %s within the compatibility line', async (_label, baseline, backend) => {
      const s = setup(withBackend(backend), [baseline]);

      await expect(s.rules.collectAll(CANDIDATE)).resolves.toMatchObject({ issues: [] });
    });

    it.each([
      ['add a backend', { ...BACKEND_V1, backend: null }],
      [
        'move its backend',
        { ...BACKEND_V1, backend: { ...BACKEND, url: 'https://other.example/owox' } },
      ],
    ])('lets a new major line %s', async (_label, baseline) => {
      const s = setup(withBackend(BACKEND), [baseline]);

      await expect(s.rules.collectAll({ ...CANDIDATE, semver: '2.0.0' })).resolves.toMatchObject({
        issues: [],
      });
    });

    it('points a 0.x plugin to a minor bump for a removed action', async () => {
      const s = setup(WITHOUT_LIST, [{ ...BACKEND_V1, semver: '0.3.0' }]);

      const report = await s.rules.collectAll({ ...CANDIDATE, semver: '0.3.1' });

      expect(report.issues).toEqual([
        {
          code: ReleaseRejectionCode.ACTIONS_INCOMPATIBLE,
          detail:
            'Action "list-documents" cannot be removed within the 0.3.0 compatibility line; bump the minor version to ship this breaking change while below 1.0.0',
        },
      ]);
    });

    it('checks an absolute backend url as declared', async () => {
      const s = setup(withBackend(BACKEND));

      await s.rules.collectAll(CANDIDATE);

      expect(s.validator.checkPublicHttps).toHaveBeenCalledWith(
        'https://acme-docs.acme.workers.dev/owox'
      );
    });

    it('checks a relative backend url resolved against delivery.url', async () => {
      const s = setup(withBackend({ ...BACKEND, url: '/owox' }));

      await s.rules.collectAll(CANDIDATE);

      expect(s.validator.checkPublicHttps).toHaveBeenCalledWith('https://plugin.example.com/owox');
    });

    it('reports a private backend url under its own prefix', async () => {
      const s = setup(withBackend(BACKEND));
      s.validator.checkPublicHttps.mockResolvedValue(PRIVATE_BACKEND);

      const report = await s.rules.collectAll(CANDIDATE);

      expect(report.issues).toEqual([
        {
          code: ReleaseRejectionCode.URL_PRIVATE_NETWORK,
          detail: 'backend.url: Unsafe URL (private-ipv4): https://10.0.0.1/owox',
        },
      ]);
    });

    it('does not check a backend url when plugin.json declares no backend', async () => {
      const s = setup();

      await s.rules.collectAll(CANDIDATE);

      expect(s.validator.checkPublicHttps).not.toHaveBeenCalled();
    });

    it('lists every issue in rule order', async () => {
      const s = setup(
        withBackend({ url: 'https://other.example/owox', actions: { 'update-document': {} } }, {}),
        [{ ...DASHBOARDS_V1, backend: BACKEND }]
      );
      s.validator.validate.mockResolvedValue(UNREACHABLE);
      s.validator.checkPublicHttps.mockResolvedValue(PRIVATE_BACKEND);

      const report = await s.rules.collectAll(CANDIDATE);

      expect(report.issues.map(issue => issue.code)).toEqual([
        ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
        ReleaseRejectionCode.ACTIONS_INCOMPATIBLE,
        ReleaseRejectionCode.BACKEND_ORIGIN_CHANGED,
        ReleaseRejectionCode.URL_UNREACHABLE,
        ReleaseRejectionCode.URL_PRIVATE_NETWORK,
      ]);
    });
  });
});

describe('ReleaseCandidateRulesService with action input schemas', () => {
  const DOCUMENT_INPUT = {
    type: 'object',
    required: ['documentId'],
    properties: { documentId: { type: 'string' } },
  };
  const withInput = (input: unknown) =>
    withBackend({ url: '/owox', actions: { 'update-document': { input } } });

  it.each([
    ['an ordinary schema', DOCUMENT_INPUT],
    [
      'a property named pattern or format',
      { type: 'object', properties: { pattern: { type: 'string' }, format: { type: 'string' } } },
    ],
    [
      'a local $ref',
      {
        $defs: { s: { type: 'string' } },
        type: 'object',
        properties: { a: { $ref: '#/$defs/s' } },
      },
    ],
    // Never compiled, so it never runs.
    [
      'a pattern in an unreferenced $defs entry',
      { $defs: { s: { type: 'string', pattern: 'x' } }, type: 'string' },
    ],
  ])('accepts an input schema with %s', async (_label, input) => {
    await expect(setup(withInput(input)).rules.collectAll(CANDIDATE)).resolves.toMatchObject({
      issues: [],
    });
  });

  it.each([
    ['pattern', { type: 'string', pattern: '^(a+)+$' }],
    ['a nested pattern', { type: 'object', properties: { a: { type: 'string', pattern: 'x' } } }],
    ['propertyNames.pattern', { type: 'object', propertyNames: { pattern: '^a' } }],
    ['patternProperties', { type: 'object', patternProperties: { '^a': { type: 'string' } } }],
    ['format', { type: 'string', format: 'email' }],
    [
      'a pattern reached through $ref',
      {
        $defs: { s: { type: 'string', pattern: 'x' } },
        type: 'object',
        properties: { a: { $ref: '#/$defs/s' } },
      },
    ],
    ['uniqueItems', { type: 'array', uniqueItems: true }],
    ['an unknown keyword', { type: 'string', foo: 1 }],
    ['an invalid type', { type: 'strin' }],
    ['a negative minItems', { type: 'array', minItems: -1 }],
    ['a draft-07 $schema', { $schema: 'http://json-schema.org/draft-07/schema#', type: 'string' }],
  ])('refuses an input schema with %s', async (_label, input) => {
    await expect(setup(withInput(input)).rules.collectAll(CANDIDATE)).resolves.toMatchObject({
      issues: [
        {
          code: ReleaseRejectionCode.ACTION_INPUT_UNSUPPORTED,
          detail: expect.stringMatching(/^backend\.actions\.update-document\.input: /),
        },
      ],
    });
  });

  it('names the refused keyword, and lists it as the only issue, as for an invalid manifest', async () => {
    const s = setup(withInput({ type: 'string', pattern: 'x' }), [DASHBOARDS_V1]);

    const report = await s.rules.collectAll(CANDIDATE);

    expect(report.issues).toEqual([
      {
        code: ReleaseRejectionCode.ACTION_INPUT_UNSUPPORTED,
        detail: 'backend.actions.update-document.input: strict mode: unknown keyword: "pattern"',
      },
    ]);
    expect(s.validator.validate).not.toHaveBeenCalled();
  });

  it('refuses it before any other rule on release sync', async () => {
    const s = setup(withInput({ type: 'string', pattern: 'x' }), [DASHBOARDS_V1]);

    await expect(s.rules.firstFailure(CANDIDATE)).resolves.toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.ACTION_INPUT_UNSUPPORTED,
    });
    expect(s.versionService.findAllByPluginId).not.toHaveBeenCalled();
  });

  it('refuses schemas the pool cannot compile within its budget, without blocking the process', async () => {
    // Within the static limits; on the main thread these took 12 s, a worker runs out of its heap.
    const names = Array.from({ length: 1999 }, (_, index) => `n${index}`);
    const actions = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [
        `action-${index}`,
        { input: { type: 'object', dependentRequired: { a: names } } },
      ])
    );
    const s = setup(withBackend({ url: '/owox', actions }));
    let last = Date.now();
    let longestPause = 0;
    const ticker = setInterval(() => {
      longestPause = Math.max(longestPause, Date.now() - last);
      last = Date.now();
    }, 20);

    try {
      await expect(s.rules.collectAll(CANDIDATE)).resolves.toMatchObject({
        issues: [
          {
            code: ReleaseRejectionCode.ACTION_INPUT_UNSUPPORTED,
            detail: 'Input schema compilation exceeded its budget',
          },
        ],
      });
    } finally {
      clearInterval(ticker);
    }
    expect(longestPause).toBeLessThan(1000);
  }, 60_000);
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
    [
      'a removed action',
      ReleaseRejectionCode.ACTIONS_INCOMPATIBLE,
      () =>
        setupExternal(
          withBackend(
            { ...BACKEND, actions: { 'update-document': {} } },
            { credentials: ['@acme/credentials'] }
          ),
          [BACKEND_V1]
        ),
    ],
    [
      'a moved backend and an unreachable delivery URL',
      ReleaseRejectionCode.BACKEND_ORIGIN_CHANGED,
      () => {
        const s = setupExternal(
          withBackend(
            { ...BACKEND, url: 'https://other.example/owox' },
            { credentials: ['@acme/credentials'] }
          ),
          [BACKEND_V1]
        );
        s.validator.validate.mockResolvedValue(UNREACHABLE);
        return s;
      },
    ],
    [
      'a private backend URL',
      ReleaseRejectionCode.URL_PRIVATE_NETWORK,
      () => {
        const s = setupExternal(withBackend(BACKEND, { credentials: ['@acme/credentials'] }));
        s.validator.checkPublicHttps.mockResolvedValue(PRIVATE_BACKEND);
        return s;
      },
    ],
    [
      'an unreachable delivery URL and a private backend URL',
      ReleaseRejectionCode.URL_UNREACHABLE,
      () => {
        const s = setupExternal(withBackend(BACKEND, { credentials: ['@acme/credentials'] }));
        s.validator.validate.mockResolvedValue(UNREACHABLE);
        s.validator.checkPublicHttps.mockResolvedValue(PRIVATE_BACKEND);
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

  it('does not check either URL after an action failure', async () => {
    const s = setupExternal(
      withBackend(
        { ...BACKEND, actions: { 'update-document': {} } },
        { credentials: ['@acme/credentials'] }
      ),
      [BACKEND_V1]
    );

    await expect(s.rules.firstFailure(CANDIDATE)).resolves.toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.ACTIONS_INCOMPATIBLE,
    });
    expect(s.validator.validate).not.toHaveBeenCalled();
    expect(s.validator.checkPublicHttps).not.toHaveBeenCalled();
  });

  it('does not check either URL after a backend origin failure', async () => {
    const s = setupExternal(
      withBackend(
        { ...BACKEND, url: 'https://other.example/owox' },
        { credentials: ['@acme/credentials'] }
      ),
      [BACKEND_V1]
    );

    await expect(s.rules.firstFailure(CANDIDATE)).resolves.toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.BACKEND_ORIGIN_CHANGED,
    });
    expect(s.validator.validate).not.toHaveBeenCalled();
    expect(s.validator.checkPublicHttps).not.toHaveBeenCalled();
  });

  it('does not resolve Credentials after a backend URL failure', async () => {
    const s = setupExternal(withBackend(BACKEND, { credentials: ['@acme/credentials'] }));
    s.validator.checkPublicHttps.mockResolvedValue(PRIVATE_BACKEND);

    await expect(s.rules.firstFailure(CANDIDATE)).resolves.toEqual({
      ...PRIVATE_BACKEND,
      detail: `backend.url: ${PRIVATE_BACKEND.detail}`,
    });
    expect(s.credentialGithub.getRepo).not.toHaveBeenCalled();
  });
});
