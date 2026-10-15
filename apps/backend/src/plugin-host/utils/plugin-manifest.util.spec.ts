import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import {
  findIncompatibleActionChange,
  findIncompatibleCollectionChange,
  parsePluginManifest,
  type PluginBackendDeclaration,
  resolveBackendUrl,
} from './plugin-manifest.util';

const validManifest = {
  name: 'Example Plugin',
  description: 'What this plugin does',
  delivery: { type: 'remote', url: 'https://plugin.example.com' },
};

const raw = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ ...validManifest, ...overrides });

describe('parsePluginManifest', () => {
  it('accepts the manifest from the specification verbatim', () => {
    expect(parsePluginManifest(raw())).toEqual({
      ok: true,
      manifest: {
        name: 'Example Plugin',
        description: 'What this plugin does',
        delivery: { type: 'remote', url: 'https://plugin.example.com' },
        collections: [],
        credentials: [],
      },
    });
  });

  it('tolerates unknown top-level keys so future manifests stay readable', () => {
    expect(parsePluginManifest(raw({ manifestVersion: 2, extra: true })).ok).toBe(true);
  });

  it('trims surrounding whitespace in name and description', () => {
    const result = parsePluginManifest(raw({ name: '  Example Plugin  ' }));
    expect(result).toMatchObject({ ok: true, manifest: { name: 'Example Plugin' } });
  });

  it('reports a missing file distinctly from a malformed one', () => {
    expect(parsePluginManifest(null)).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_MISSING,
    });
  });

  it.each(['{not json', '', 'null', '[]', '"a string"'])('rejects %s as invalid json', body => {
    expect(parsePluginManifest(body)).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_INVALID_JSON,
    });
  });

  // Split out from MANIFEST_SCHEMA because "only remote delivery is supported today"
  // is an actionable publisher message, and a generic schema error is not.
  it.each(['bundle', 'source', 'hosted'])('reports delivery.type %s as unsupported', type => {
    expect(
      parsePluginManifest(raw({ delivery: { type, url: 'https://x.example' } }))
    ).toMatchObject({ ok: false, code: ReleaseRejectionCode.DELIVERY_UNSUPPORTED });
  });

  it.each([
    ['empty name', { name: '' }],
    ['whitespace-only name', { name: '   ' }],
    ['missing description', { description: undefined }],
    ['http delivery url', { delivery: { type: 'remote', url: 'http://plugin.example.com' } }],
    ['non-url delivery', { delivery: { type: 'remote', url: 'plugin.example.com' } }],
    ['missing delivery', { delivery: undefined }],
    ['delivery.type absent', { delivery: { url: 'https://x.example' } }],
  ])('rejects %s as a schema error', (_label, overrides) => {
    expect(parsePluginManifest(raw(overrides))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_SCHEMA,
    });
  });

  it('never throws, whatever it is handed', () => {
    expect(() => parsePluginManifest('\u0000\uFFFF')).not.toThrow();
  });

  const DOCS = 'https://www.googleapis.com/auth/documents';

  it('accepts a Google Service Account requirement with scopes', () => {
    expect(
      parsePluginManifest(raw({ credentials: [{ id: 'google-service-account', scopes: [DOCS] }] }))
    ).toMatchObject({
      ok: true,
      manifest: {
        credentials: [{ id: 'google-service-account', optional: false, scopes: [DOCS] }],
      },
    });
  });

  it.each([
    ['google-service-account', 'google-service-account requires scopes'],
    [{ id: 'google-service-account' }, 'google-service-account requires scopes'],
    [{ id: 'github', scopes: ['repo'] }, 'scopes are supported only for google-service-account'],
    [{ id: '@acme/crm', scopes: ['read'] }, 'scopes are supported only for google-service-account'],
    [{ id: 'google-service-account', scopes: [DOCS, DOCS] }, 'scopes must be unique'],
  ])('rejects %j with "%s"', (requirement, message) => {
    expect(parsePluginManifest(raw({ credentials: [requirement] }))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_SCHEMA,
      detail: expect.stringContaining(message),
    });
  });

  it.each([[[]], [['has space']], [[`https://x/${'a'.repeat(200)}`]]])(
    'rejects malformed scopes %j',
    scopes => {
      expect(
        parsePluginManifest(raw({ credentials: [{ id: 'google-service-account', scopes }] }))
      ).toMatchObject({ ok: false, code: ReleaseRejectionCode.MANIFEST_SCHEMA });
    }
  );

  it('accepts exact, logical AI, and optional Credential requirements', () => {
    expect(
      parsePluginManifest(
        raw({
          credentials: [
            'github',
            { id: 'ai', models: ['fast', 'reasoning'] },
            { id: 'openai', optional: true },
          ],
        })
      )
    ).toMatchObject({
      ok: true,
      manifest: {
        credentials: [
          'github',
          { id: 'ai', optional: false, models: ['fast', 'reasoning'] },
          { id: 'openai', optional: true },
        ],
      },
    });
  });

  it('rejects duplicate Credential requirement handles', () => {
    expect(parsePluginManifest(raw({ credentials: ['github', { id: 'github' }] }))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_SCHEMA,
    });
  });

  it('rejects an exact Credential requirement that is neither built-in nor a GitHub locator', () => {
    expect(parsePluginManifest(raw({ credentials: ['stripe'] }))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_SCHEMA,
    });
  });

  it.each([
    [{ id: 'ai', models: ['unknown'] }, 'unsupported logical AI model'],
    [{ id: 'ai', models: [] }, 'empty logical AI model list'],
    [{ id: 'ai', models: ['fast', 'fast'] }, 'duplicate logical AI model'],
    [{ id: 'github', models: ['fast'] }, 'models on an exact requirement'],
  ])('rejects %s (%s)', (requirement, _label) => {
    expect(parsePluginManifest(raw({ credentials: [requirement] }))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_SCHEMA,
    });
  });

  it('accepts a project collection bound to a Data Mart action map', () => {
    const result = parsePluginManifest(
      raw({
        collections: [
          {
            name: 'dashboards',
            scope: 'project',
            entityBinding: {
              type: 'data-mart',
              actions: { read: 'SEE', create: 'SEE', update: 'SEE', delete: 'SEE' },
            },
          },
        ],
      })
    );
    expect(result).toMatchObject({
      ok: true,
      manifest: { collections: [{ name: 'dashboards', scope: 'project' }] },
    });
  });

  it.each([
    [[{ name: '', scope: 'project' }], 'invalid name'],
    [[{ name: '..', scope: 'project' }], 'dot-segment name'],
    [
      [
        { name: 'same', scope: 'project' },
        { name: 'same', scope: 'member' },
      ],
      'duplicate name',
    ],
    [
      [
        {
          name: 'dashboards',
          scope: 'project',
          entityBinding: {
            type: 'report',
            actions: { read: 'SEE', create: 'USE', update: 'EDIT', delete: 'DELETE' },
          },
        },
      ],
      'unsupported entity action',
    ],
  ])('rejects collections with %s', (collections, _label) => {
    expect(parsePluginManifest(raw({ collections }))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_SCHEMA,
    });
  });
});

describe('findIncompatibleCollectionChange', () => {
  const dashboards = {
    name: 'dashboards',
    scope: 'project' as const,
    entityBinding: {
      type: 'data-mart' as const,
      actions: {
        read: 'SEE' as const,
        create: 'SEE' as const,
        update: 'SEE' as const,
        delete: 'SEE' as const,
      },
    },
  };

  it('allows additions and action-map changes', () => {
    expect(
      findIncompatibleCollectionChange(
        [dashboards],
        [
          {
            ...dashboards,
            entityBinding: {
              ...dashboards.entityBinding,
              actions: { ...dashboards.entityBinding.actions, update: 'EDIT' },
            },
          },
          { name: 'settings', scope: 'member' },
        ]
      )
    ).toBeNull();
  });

  it('rejects removal, scope changes and binding changes', () => {
    expect(findIncompatibleCollectionChange([dashboards], [])).toContain('cannot be removed');
    expect(
      findIncompatibleCollectionChange([dashboards], [{ ...dashboards, scope: 'member' }])
    ).toContain('cannot change scope');
    expect(
      findIncompatibleCollectionChange([dashboards], [{ ...dashboards, entityBinding: undefined }])
    ).toContain('cannot change entity binding');
  });
});

const BACKEND_URL = 'https://acme-docs.acme.workers.dev/owox';
const DOCUMENT_INPUT = {
  type: 'object',
  required: ['documentId'],
  properties: { documentId: { type: 'string' } },
};
const backend = (actions: Record<string, unknown>, url: string = BACKEND_URL) => ({
  url,
  actions,
});
const manyActions = (count: number) =>
  Object.fromEntries(Array.from({ length: count }, (_, index) => [`action-${index}`, {}]));
const withInput = (input: unknown) => raw({ backend: backend({ 'update-document': { input } }) });

describe('parsePluginManifest: backend', () => {
  it('accepts the backend block from the specification and defaults the timeout', () => {
    expect(
      parsePluginManifest(
        raw({
          backend: backend({
            'update-document': { timeoutSeconds: 60, input: DOCUMENT_INPUT },
            'list-documents': {},
          }),
        })
      )
    ).toMatchObject({
      ok: true,
      manifest: {
        backend: {
          url: BACKEND_URL,
          actions: {
            'update-document': { timeoutSeconds: 60, input: DOCUMENT_INPUT },
            'list-documents': { timeoutSeconds: 30 },
          },
        },
      },
    });
  });

  it('leaves backend undefined when plugin.json declares none', () => {
    const result = parsePluginManifest(raw());

    expect(result.ok).toBe(true);
    expect(result.ok && result.manifest.backend).toBeUndefined();
  });

  it('accepts 50 actions and a 64-character name', () => {
    expect(
      parsePluginManifest(raw({ backend: backend(manyActions(PLUGIN_ACTION_LIMITS.maxActions)) }))
        .ok
    ).toBe(true);
    expect(parsePluginManifest(raw({ backend: backend({ [`a${'b'.repeat(63)}`]: {} }) })).ok).toBe(
      true
    );
  });

  it.each([
    ['an empty url', backend({ run: {} }, '')],
    ['no url', { actions: { run: {} } }],
    ['no actions', { url: BACKEND_URL }],
    ['an empty action map', backend({})],
    ['51 actions', backend(manyActions(51))],
    ['an upper-case name', backend({ Run: {} })],
    ['a name starting with a digit', backend({ '1run': {} })],
    ['an underscore in a name', backend({ run_now: {} })],
    ['a 65-character name', backend({ [`a${'b'.repeat(64)}`]: {} })],
    ['timeoutSeconds 0', backend({ run: { timeoutSeconds: 0 } })],
    ['timeoutSeconds 301', backend({ run: { timeoutSeconds: 301 } })],
    ['a fractional timeoutSeconds', backend({ run: { timeoutSeconds: 1.5 } })],
    ['timeoutSeconds as a string', backend({ run: { timeoutSeconds: '30' } })],
    ['an array input schema', backend({ run: { input: [] } })],
    ['a boolean input schema', backend({ run: { input: true } })],
  ])('rejects a backend with %s as a schema error', (_label, value) => {
    expect(parsePluginManifest(raw({ backend: value }))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.MANIFEST_SCHEMA,
    });
  });

  describe('backend.url', () => {
    const DELIVERY = { type: 'remote', url: 'https://a.workers.dev/app/' };
    const withUrl = (url: string) =>
      parsePluginManifest(raw({ delivery: DELIVERY, backend: backend({ run: {} }, url) }));

    it.each(['/owox', 'owox', './owox', '../owox', 'https://b.example/owox'])(
      'accepts %s and stores it as declared',
      url => {
        expect(withUrl(url)).toMatchObject({ ok: true, manifest: { backend: { url } } });
      }
    );

    it.each([
      ['plain http', 'http://a.workers.dev/owox'],
      ['a protocol-relative reference to another host', '//evil.example/owox'],
      ['a backslash reference to another host', '\\\\evil.example'],
      ['a slash-backslash reference to another host', '/\\evil.example'],
      ['a non-http scheme', 'javascript:alert(1)'],
      ['a user name and password', 'https://u:p@b.example/owox'],
      ['a user name', 'https://u@b.example/owox'],
      ['a user name on the delivery host', '//u:p@a.workers.dev/owox'],
    ])('rejects %s', (_label, url) => {
      expect(withUrl(url)).toMatchObject({
        ok: false,
        code: ReleaseRejectionCode.MANIFEST_SCHEMA,
        detail: expect.stringContaining('backend.url: '),
      });
    });

    // Every dispatch would fail: fetch refuses a URL with credentials in it.
    it('rejects a relative url that inherits a user name from delivery.url', () => {
      expect(
        parsePluginManifest(
          raw({
            delivery: { type: 'remote', url: 'https://u:p@a.workers.dev/app/' },
            backend: backend({ run: {} }, '/owox'),
          })
        )
      ).toMatchObject({
        ok: false,
        code: ReleaseRejectionCode.MANIFEST_SCHEMA,
        detail: expect.stringContaining(
          'backend.url: the URL must not contain a user name or password'
        ),
      });
    });
  });

  // Refusals that need an ajv compile are in release-candidate-rules.service.spec.ts.
  it.each([
    ['a remote $ref', { $ref: 'https://example.com/schema.json' }],
    ['$async', { $async: true, type: 'string' }],
  ])('rejects an input schema with %s', (_label, input) => {
    expect(parsePluginManifest(withInput(input))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.ACTION_INPUT_UNSUPPORTED,
      detail: expect.stringMatching(/^backend\.actions\.update-document\.input: /),
    });
  });

  it('rejects an input schema nested too deep to measure without throwing', () => {
    const depth = 20_000;
    const input = '{"a":'.repeat(depth) + '1' + '}'.repeat(depth);
    const manifest = `{"name":"Example Plugin","description":"d","delivery":{"type":"remote","url":"https://plugin.example.com"},"backend":{"url":"/owox","actions":{"update-document":{"input":${input}}}}}`;

    expect(parsePluginManifest(manifest)).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.ACTION_INPUT_UNSUPPORTED,
      detail: expect.stringMatching(/^backend\.actions\.update-document\.input: /),
    });
  });

  it('rejects an input schema over 32 KiB', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 2000 }, (_, index) => [
        `field${index}`,
        { type: 'string', description: 'x'.repeat(10) },
      ])
    );

    expect(parsePluginManifest(withInput({ type: 'object', properties }))).toMatchObject({
      ok: false,
      code: ReleaseRejectionCode.ACTION_INPUT_UNSUPPORTED,
      detail: 'backend.actions.update-document.input: exceeds 32 KiB',
    });
  });
});

describe('resolveBackendUrl', () => {
  const actions = { run: { timeoutSeconds: 30 } };

  it.each([
    ['/owox', 'https://a.workers.dev/owox'],
    ['owox', 'https://a.workers.dev/app/owox'],
    ['https://b.example/owox', 'https://b.example/owox'],
  ])('resolves %s against the delivery URL', (url, expected) => {
    expect(resolveBackendUrl({ url, actions }, 'https://a.workers.dev/app/')).toBe(expected);
  });
});

describe('findIncompatibleActionChange', () => {
  const current: PluginBackendDeclaration = {
    url: BACKEND_URL,
    actions: {
      'update-document': { timeoutSeconds: 60, input: DOCUMENT_INPUT },
      'list-documents': { timeoutSeconds: 30 },
    },
  };

  it('allows added actions and a changed url, timeout or input', () => {
    expect(
      findIncompatibleActionChange(current, {
        url: '/owox',
        actions: {
          'update-document': { timeoutSeconds: 120 },
          'list-documents': { timeoutSeconds: 30, input: { type: 'object' } },
          'delete-document': { timeoutSeconds: 30 },
        },
      })
    ).toBeNull();
  });

  it('rejects a removed action', () => {
    expect(
      findIncompatibleActionChange(current, {
        url: BACKEND_URL,
        actions: { 'update-document': { timeoutSeconds: 60 } },
      })
    ).toBe('Action "list-documents" cannot be removed');
  });

  it('treats a dropped backend block as removing every action', () => {
    expect(findIncompatibleActionChange(current, undefined)).toBe(
      'Action "update-document" cannot be removed'
    );
  });

  it('accepts anything over a baseline without a backend', () => {
    expect(findIncompatibleActionChange(null, current)).toBeNull();
    expect(findIncompatibleActionChange(undefined, undefined)).toBeNull();
  });
});
