import {
  CredentialDefinitionContractSchema,
  CredentialDocumentationUrlSchema,
  credentialIdentity,
  resolveCredentialAiModelMappings,
} from './credential.types';

const definition = {
  id: 'acme',
  displayName: 'Acme',
  description: '',
  auth: { type: 'header' as const, label: 'API key', headerName: 'authorization' },
  origins: ['https://api.acme.example'],
};

describe('Credential documentation URL', () => {
  it('accepts and normalises an absolute HTTPS URL', () => {
    expect(CredentialDocumentationUrlSchema.parse('  HTTPS://Docs.Example.com/keys  ')).toBe(
      'https://docs.example.com/keys'
    );
  });

  it.each([
    'http://docs.example.com/keys',
    'javascript:alert(1)',
    'data:text/html,unsafe',
    '//docs.example.com/keys',
    '/keys',
    'https://user:password@docs.example.com/keys',
  ])('rejects unsafe documentation URL %s', documentationUrl => {
    expect(CredentialDocumentationUrlSchema.safeParse(documentationUrl).success).toBe(false);
  });

  it('keeps documentation metadata optional for existing definitions', () => {
    expect(CredentialDefinitionContractSchema.parse(definition)).not.toHaveProperty(
      'documentationUrl'
    );
  });
});

describe('resolveCredentialAiModelMappings', () => {
  it('follows a changed recommendation for mappings in recommended mode', () => {
    expect(
      resolveCredentialAiModelMappings(
        { fast: 'old-fast', reasoning: 'custom-reasoning' },
        { fast: 'recommended', reasoning: 'override' },
        { fast: 'new-fast', reasoning: 'new-reasoning' }
      )
    ).toEqual({ fast: 'new-fast', reasoning: 'custom-reasoning' });
  });

  it('keeps an override stable when recommendations change', () => {
    expect(
      resolveCredentialAiModelMappings(
        { fast: 'custom-fast' },
        { fast: 'override' },
        { fast: 'new-fast' }
      )
    ).toEqual({ fast: 'custom-fast' });
  });
});

describe('fields and oauth definitions', () => {
  const field = (key: string, extra: Record<string, unknown> = {}) => ({
    key,
    label: key,
    input: 'text',
    secret: false,
    required: true,
    identity: false,
    ...extra,
  });
  const fieldsDefinition = (fields: unknown[], extra: Record<string, unknown> = {}) => ({
    id: 'snowflake',
    displayName: 'Snowflake',
    auth: { type: 'fields', fields },
    ...extra,
  });
  const parse = (value: unknown) => CredentialDefinitionContractSchema.safeParse(value);

  it('accepts a fields definition without origins', () => {
    expect(parse(fieldsDefinition([field('username', { identity: true })])).success).toBe(true);
  });

  it('rejects a header definition without origins', () => {
    const { origins: _origins, ...withoutOrigins } = definition;
    expect(parse(withoutOrigins).success).toBe(false);
  });

  it('rejects a validation block without origins', () => {
    expect(
      parse(fieldsDefinition([field('username')], { validation: { path: '/ping' } })).success
    ).toBe(false);
  });

  it('rejects duplicate field keys', () => {
    expect(parse(fieldsDefinition([field('username'), field('username')])).success).toBe(false);
  });

  it('rejects a secret identity field', () => {
    expect(
      parse(fieldsDefinition([field('password', { secret: true, identity: true })])).success
    ).toBe(false);
  });

  it('rejects two identity fields', () => {
    expect(
      parse(fieldsDefinition([field('a', { identity: true }), field('b', { identity: true })]))
        .success
    ).toBe(false);
  });

  it('defaults category to other', () => {
    expect(CredentialDefinitionContractSchema.parse(definition).category).toBe('other');
  });

  describe('credentialIdentity', () => {
    const contract = (value: unknown) => CredentialDefinitionContractSchema.parse(value);

    it('reads clientEmail from service account metadata', () => {
      expect(
        credentialIdentity(contract(definition), {
          clientEmail: 'sa@p.iam.gserviceaccount.com',
          projectId: 'p',
          privateKeyId: 'k',
        })
      ).toBe('sa@p.iam.gserviceaccount.com');
    });

    it('reads the identity field value from fields metadata', () => {
      expect(
        credentialIdentity(
          contract(fieldsDefinition([field('username', { identity: true }), field('region')])),
          { fields: { username: 'alice', region: 'eu' } }
        )
      ).toBe('alice');
    });

    it('reads the account email from oauth metadata', () => {
      expect(
        credentialIdentity(
          contract({
            id: 'google',
            displayName: 'Google',
            auth: {
              type: 'oauth',
              provider: 'google',
              client: 'storage',
              scopes: 'bigquery',
              label: 'Google',
            },
          }),
          { account: { email: 'a@b.c', name: null, picture: null }, scopes: [] }
        )
      ).toBe('a@b.c');
    });

    it('returns null when a fields definition has no identity field', () => {
      expect(
        credentialIdentity(contract(fieldsDefinition([field('region')])), {
          fields: { region: 'eu' },
        })
      ).toBeNull();
    });
  });
});
