import {
  CredentialDefinitionContractSchema,
  CredentialDocumentationUrlSchema,
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
