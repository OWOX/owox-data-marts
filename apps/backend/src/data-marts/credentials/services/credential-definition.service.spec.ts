import { ConflictException } from '@nestjs/common';
import { CredentialDefinitionService } from './credential-definition.service';

const external = {
  id: 'definition-1',
  githubRepoId: '123',
  currentVersionId: 'version-2',
  currentCompatibilityLine: '2',
};
const version = {
  id: 'version-2',
  externalDefinitionId: 'definition-1',
  semver: '2.0.0',
  compatibilityLine: '2',
  contract: {
    id: 'acme',
    displayName: 'Acme',
    description: '',
    documentationUrl: 'https://docs.acme.example/api-keys',
    auth: { type: 'header', label: 'API key', headerName: 'authorization' },
    origins: ['https://api.acme.example'],
  },
};

describe('CredentialDefinitionService external consent', () => {
  const externalDefinitions = {
    findOneBy: jest.fn().mockResolvedValue(external),
    find: jest.fn().mockResolvedValue([external]),
  };
  const versions = { findOneBy: jest.fn().mockResolvedValue(version) };
  const service = new CredentialDefinitionService(externalDefinitions as never, versions as never);

  it('shows current metadata but blocks runtime until the current line is accepted', async () => {
    await expect(service.getForView({ definitionId: 'definition-1' })).resolves.toMatchObject({
      compatibilityLine: '2',
      contract: { documentationUrl: 'https://docs.acme.example/api-keys' },
    });
    await expect(
      service.getForCredential({
        definitionId: 'definition-1',
        acceptedCompatibilityLine: '1',
      })
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.getForCredential({
        definitionId: 'definition-1',
        acceptedCompatibilityLine: '2',
      })
    ).resolves.toMatchObject({ compatibilityLine: '2' });
  });
});

describe('CredentialDefinitionService Source definitions', () => {
  const service = new CredentialDefinitionService(
    { find: jest.fn().mockResolvedValue([]), findOneBy: jest.fn() } as never,
    { findOneBy: jest.fn() } as never
  );

  it('lists the generated Source definitions beside the built-in ones', async () => {
    const ids = (await service.list()).map(item => item.definitionId);

    expect(ids).toEqual(
      expect.arrayContaining([
        'github',
        'custom-connector',
        'source:Shopify:default',
        'source:GoogleSheets:oauth2',
      ])
    );
  });

  it("resolves a Credential's Source definition for the list view", async () => {
    await expect(
      service.getForView({ definitionId: 'source:Shopify:default' })
    ).resolves.toMatchObject({ definitionId: 'source:Shopify:default', source: 'builtin' });
  });

  it('lists the connectors whose Source bindings reuse a built-in definition', async () => {
    const listed = new Map(
      (await service.list()).map(item => [item.definitionId, item.contract.connectors])
    );

    expect(listed.get('github')).toEqual(['GitHub']);
    expect(listed.get('google-service-account')).toEqual(['GoogleSheets']);
    expect(listed.get('openai')).toEqual(undefined);
    await expect(service.get('github')).resolves.toMatchObject({
      contract: { connectors: ['GitHub'] },
    });
  });

  it('resolves a generated Source definition as built-in', async () => {
    await expect(service.get('source:Shopify:default')).resolves.toMatchObject({
      source: 'builtin',
      compatibilityLine: null,
      contract: { displayName: 'Shopify', category: 'ecommerce' },
    });
    await expect(
      service.getForCredential({
        definitionId: 'source:Shopify:default',
        acceptedCompatibilityLine: null,
      })
    ).resolves.toMatchObject({ source: 'builtin' });
  });
});
