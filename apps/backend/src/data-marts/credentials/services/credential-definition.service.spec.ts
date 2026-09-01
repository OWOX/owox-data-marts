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
