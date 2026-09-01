import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { findIncompatibleCollectionChange, parsePluginManifest } from './plugin-manifest.util';

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
