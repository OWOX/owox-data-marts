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

  it('does not offer the generated Source definitions for creation', async () => {
    const ids = (await service.list()).map(item => item.definitionId);

    expect(ids).toEqual(expect.arrayContaining(['github']));
    expect(ids.filter(id => id.startsWith('source:'))).toEqual([]);
  });

  it('does not offer the Custom connector definition for creation, yet resolves it', async () => {
    const ids = (await service.list()).map(item => item.definitionId);
    const resolved = { definitionId: 'custom-connector', source: 'builtin' };

    expect(ids).not.toContain('custom-connector');
    await expect(service.get('custom-connector')).resolves.toMatchObject(resolved);
    await expect(
      service.getForCredential({
        definitionId: 'custom-connector',
        acceptedCompatibilityLine: null,
      })
    ).resolves.toMatchObject(resolved);
    await expect(service.getForView({ definitionId: 'custom-connector' })).resolves.toMatchObject(
      resolved
    );
  });

  it("resolves a Credential's Source definition for the list view", async () => {
    await expect(
      service.getForView({ definitionId: 'source:Shopify:default' })
    ).resolves.toMatchObject({ definitionId: 'source:Shopify:default', source: 'builtin' });
  });

  it('resolves the connectors whose Source bindings reuse a built-in definition', async () => {
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
