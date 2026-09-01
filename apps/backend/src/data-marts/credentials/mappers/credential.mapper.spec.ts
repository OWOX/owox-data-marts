import type { UserProjectionsFetcherService } from '../../services/user-projections-fetcher.service';
import type { Credential } from '../entities/credential.entity';
import { CredentialMapper, mapCredentialDefinitionToApiDto } from './credential.mapper';

describe('CredentialMapper', () => {
  it('never includes the stored secret in a management response', async () => {
    const users = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue([]),
    } as unknown as UserProjectionsFetcherService;
    const mapper = new CredentialMapper(users);
    const credential = {
      id: 'credential-1',
      projectId: 'project-1',
      title: 'Production GitHub',
      secret: { value: 'provider-secret' },
      enabled: true,
      availableForUse: true,
      availableForMaintenance: false,
      aiModelMappings: null,
      owners: [],
      contexts: [],
      createdAt: new Date('2026-08-27T00:00:00Z'),
      modifiedAt: new Date('2026-08-27T00:00:00Z'),
    } as unknown as Credential;

    const dto = await mapper.toDto(
      credential,
      {
        definitionId: 'github',
        source: 'builtin',
        compatibilityLine: null,
        contract: {
          id: 'github',
          displayName: 'GitHub',
          description: '',
          documentationUrl:
            'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
          origins: ['https://api.github.com'],
          auth: {
            type: 'header',
            label: 'API key',
            headerName: 'authorization',
            prefix: 'Bearer ',
          },
        },
      },
      [],
      null
    );

    const response = mapper.toApiResponse(dto);
    expect(response.secretConfigured).toBe(true);
    expect(response.definition.documentationUrl).toContain('https://docs.github.com/');
    expect(response).not.toHaveProperty('secret');
    expect(JSON.stringify(response)).not.toContain('provider-secret');
  });

  it('maps an absent documentation URL to a stable null API field', () => {
    expect(
      mapCredentialDefinitionToApiDto({
        definitionId: 'acme',
        source: 'external',
        compatibilityLine: '1',
        contract: {
          id: 'acme',
          displayName: 'Acme',
          description: '',
          origins: ['https://api.acme.example'],
          auth: { type: 'header', label: 'API key', headerName: 'authorization' },
        },
      })
    ).toMatchObject({ documentationUrl: null });
  });

  it('maps persisted validation state on an ordinary reload', async () => {
    const mapper = new CredentialMapper({
      fetchUserProjectionsList: jest.fn().mockResolvedValue([]),
    } as unknown as UserProjectionsFetcherService);
    const validatedAt = new Date('2026-08-31T06:00:00.000Z');
    const credential = {
      id: 'credential-1',
      projectId: 'project-1',
      title: 'Production GitHub',
      definitionSource: 'builtin',
      definitionId: 'github',
      acceptedCompatibilityLine: null,
      secret: { value: 'provider-secret' },
      enabled: true,
      availableForUse: true,
      availableForMaintenance: false,
      validationState: 'verified',
      validationMessage: 'accepted',
      validatedAt,
      aiModelMappings: null,
      aiModelMappingModes: null,
      owners: [],
      contexts: [],
      createdAt: validatedAt,
      modifiedAt: validatedAt,
    } as unknown as Credential;

    await expect(
      mapper.toDto(
        credential,
        {
          definitionId: 'github',
          source: 'builtin',
          compatibilityLine: null,
          contract: {
            id: 'github',
            displayName: 'GitHub',
            description: '',
            auth: { type: 'header', label: 'API key', headerName: 'authorization' },
            origins: ['https://api.github.com'],
          },
        },
        [],
        null
      )
    ).resolves.toMatchObject({
      validationState: 'verified',
      validationMessage: 'accepted',
      validatedAt,
    });
  });
});
