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
});
