import { parseExternalCredentialManifest } from './external-credential-manifest';

const manifest = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: 'Acme CRM Credentials',
    description: 'Authenticate to Acme CRM',
    delivery: { type: 'credential-definition' },
    credential: {
      name: 'acme',
      authentication: {
        type: 'secret',
        label: 'API key',
        placement: { type: 'header', name: 'Authorization', scheme: 'Bearer' },
      },
      origins: ['https://api.acme.example'],
    },
    ...overrides,
  });

describe('parseExternalCredentialManifest', () => {
  it('converts the declarative GitHub contract into the trusted internal definition', () => {
    expect(parseExternalCredentialManifest(manifest())).toEqual({
      ok: true,
      contract: {
        id: 'acme',
        displayName: 'Acme CRM Credentials',
        description: 'Authenticate to Acme CRM',
        documentationUrl: undefined,
        auth: {
          type: 'header',
          label: 'API key',
          headerName: 'Authorization',
          prefix: 'Bearer ',
        },
        origins: ['https://api.acme.example'],
        validation: undefined,
        ai: undefined,
      },
    });
  });

  it('passes a normalised HTTPS documentation URL into the trusted definition', () => {
    const source = JSON.parse(manifest()) as {
      credential: Record<string, unknown>;
    };
    source.credential.documentationUrl = '  HTTPS://Docs.Acme.Example/api-keys  ';

    expect(parseExternalCredentialManifest(JSON.stringify(source))).toMatchObject({
      ok: true,
      contract: {
        documentationUrl: 'https://docs.acme.example/api-keys',
      },
    });
  });

  it.each([
    'http://docs.acme.example/api-keys',
    'javascript:alert(1)',
    '/api-keys',
    'https://user:password@docs.acme.example/api-keys',
  ])('rejects unsafe documentation URL %s', documentationUrl => {
    const source = JSON.parse(manifest()) as {
      credential: Record<string, unknown>;
    };
    source.credential.documentationUrl = documentationUrl;

    expect(parseExternalCredentialManifest(JSON.stringify(source))).toMatchObject({ ok: false });
  });

  it.each([
    ['runnable delivery', { delivery: { type: 'remote', url: 'https://evil.example' } }],
    [
      'reserved runtime name',
      {
        credential: {
          name: 'github',
          authentication: {
            type: 'secret',
            label: 'key',
            placement: { type: 'header', name: 'x-api-key' },
          },
          origins: ['https://api.acme.example'],
        },
      },
    ],
    [
      'raw-secret header boundary escape',
      {
        credential: {
          name: 'acme',
          authentication: {
            type: 'secret',
            label: 'key',
            placement: { type: 'header', name: 'Cookie' },
          },
          origins: ['https://api.acme.example'],
        },
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(parseExternalCredentialManifest(manifest(overrides))).toMatchObject({ ok: false });
  });

  it('reserves then because the SDK proxy cannot expose that handle', () => {
    const source = JSON.parse(manifest()) as { credential: Record<string, unknown> };
    source.credential.name = 'then';

    expect(parseExternalCredentialManifest(JSON.stringify(source))).toMatchObject({ ok: false });
  });

  it.each([
    ['root', (source: Record<string, unknown>) => (source.unsupported = true), 'unsupported'],
    [
      'credential',
      (source: Record<string, unknown>) =>
        ((source.credential as Record<string, unknown>).unsupported = true),
      'credential',
    ],
    [
      'authentication placement',
      (source: Record<string, unknown>) => {
        const credential = source.credential as Record<string, unknown>;
        const authentication = credential.authentication as Record<string, unknown>;
        (authentication.placement as Record<string, unknown>).unsupported = true;
      },
      'credential.authentication.placement',
    ],
  ])('rejects unknown fields at %s and reports their path', (_label, mutate, path) => {
    const source = JSON.parse(manifest()) as Record<string, unknown>;
    mutate(source);

    expect(parseExternalCredentialManifest(JSON.stringify(source))).toMatchObject({
      ok: false,
      detail: expect.stringContaining(path),
    });
  });

  it.each([
    [
      'missing catalogs and recommendations',
      {
        adapter: { type: 'openai-compatible', baseUrl: 'https://api.acme.example/v1' },
      },
    ],
    [
      'recommendation outside the language catalog',
      {
        adapter: { type: 'openai-compatible', baseUrl: 'https://api.acme.example/v1' },
        models: {
          language: [{ id: 'acme-fast', name: 'Acme Fast' }],
          embedding: [],
        },
        recommended: { fast: 'missing-fast', reasoning: 'acme-fast' },
      },
    ],
    [
      'embedding recommendation outside the embedding catalog',
      {
        adapter: { type: 'openai-compatible', baseUrl: 'https://api.acme.example/v1' },
        models: {
          language: [
            { id: 'acme-fast', name: 'Acme Fast' },
            { id: 'acme-reasoning', name: 'Acme Reasoning' },
          ],
          embedding: [],
        },
        recommended: {
          fast: 'acme-fast',
          reasoning: 'acme-reasoning',
          embedding: 'missing-embedding',
        },
      },
    ],
  ])('rejects an AI definition with %s', (_label, ai) => {
    const source = JSON.parse(manifest()) as { credential: Record<string, unknown> };
    source.credential.ai = ai;

    expect(parseExternalCredentialManifest(JSON.stringify(source))).toMatchObject({ ok: false });
  });
});
