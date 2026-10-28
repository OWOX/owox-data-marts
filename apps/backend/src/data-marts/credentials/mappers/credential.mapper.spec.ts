import type { UserProjectionsFetcherService } from '../../services/user-projections-fetcher.service';
import type { CredentialConsumerBinding } from '../entities/credential-consumer-binding.entity';
import type { Credential } from '../entities/credential.entity';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from '../services/builtin-credential-definitions';
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
          category: 'other',
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
      null,
      true,
      new Map()
    );

    const response = mapper.toApiResponse(dto);
    expect(response.secretConfigured).toBe(true);
    expect(response.definition.documentationUrl).toContain('https://docs.github.com/');
    expect(response).not.toHaveProperty('secret');
    expect(JSON.stringify(response)).not.toContain('provider-secret');
  });

  it('maps an absent documentation URL and icon to stable null API fields', () => {
    expect(
      mapCredentialDefinitionToApiDto({
        definitionId: 'acme',
        source: 'external',
        compatibilityLine: '1',
        contract: {
          id: 'acme',
          displayName: 'Acme',
          description: '',
          category: 'other',
          origins: ['https://api.acme.example'],
          auth: { type: 'header', label: 'API key', headerName: 'authorization' },
        },
      })
    ).toMatchObject({ documentationUrl: null, icon: null });
  });

  it.each([
    ['aws-access-key', 'aws', [DataStorageType.AWS_ATHENA, DataStorageType.AWS_REDSHIFT]],
    [
      'google-oauth',
      'google',
      [DataStorageType.GOOGLE_BIGQUERY, DataStorageType.LEGACY_GOOGLE_BIGQUERY],
    ],
    ['snowflake-key-pair', 'snowflake', [DataStorageType.SNOWFLAKE]],
    ['databricks-token', 'databricks', [DataStorageType.DATABRICKS]],
    ['github', 'github', []],
  ])('serves %s with its icon and the Storage types it fits', (id, icon, storageTypes) => {
    const contract = BUILTIN_CREDENTIAL_DEFINITIONS.find(definition => definition.id === id)!;

    expect(
      mapCredentialDefinitionToApiDto({
        definitionId: id,
        source: 'builtin',
        compatibilityLine: null,
        contract,
      })
    ).toMatchObject({ icon, storageTypes });
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
            category: 'other',
            auth: { type: 'header', label: 'API key', headerName: 'authorization' },
            origins: ['https://api.github.com'],
          },
        },
        [],
        null,
        false,
        new Map()
      )
    ).resolves.toMatchObject({
      validationState: 'verified',
      validationMessage: 'accepted',
      validatedAt,
    });
  });

  it('exposes the authentication type of a definition but nothing else of it', () => {
    const dto = mapCredentialDefinitionToApiDto({
      definitionId: 'google-service-account',
      source: 'builtin',
      compatibilityLine: null,
      contract: {
        id: 'google-service-account',
        displayName: 'BigQuery Service Account',
        description: '',
        category: 'other',
        origins: ['https://*.googleapis.com'],
        auth: { type: 'google-service-account', label: 'Service account key (JSON)' },
      },
    });

    expect(dto.auth).toEqual({ type: 'google-service-account' });
    expect(dto.secretLabel).toBe('Service account key (JSON)');
  });

  it('returns the public metadata of a key and still no secret', async () => {
    const mapper = new CredentialMapper({
      fetchUserProjectionsList: jest.fn().mockResolvedValue([]),
    } as unknown as UserProjectionsFetcherService);
    const publicMetadata = {
      clientEmail: 'docs-writer@acme-docs.iam.gserviceaccount.com',
      projectId: 'acme-docs',
      privateKeyId: 'key-1',
    };
    const credential = {
      id: 'credential-1',
      projectId: 'project-1',
      title: 'Docs writer',
      secret: { value: 'stored-key-json' },
      publicMetadata,
      enabled: true,
      availableForUse: true,
      availableForMaintenance: false,
      aiModelMappings: null,
      owners: [],
      contexts: [],
      createdAt: new Date('2026-10-15T00:00:00Z'),
      modifiedAt: new Date('2026-10-15T00:00:00Z'),
    } as unknown as Credential;

    const response = mapper.toApiResponse(
      await mapper.toDto(
        credential,
        {
          definitionId: 'google-service-account',
          source: 'builtin',
          compatibilityLine: null,
          contract: {
            id: 'google-service-account',
            displayName: 'BigQuery Service Account',
            description: '',
            category: 'other',
            origins: ['https://*.googleapis.com'],
            auth: { type: 'google-service-account', label: 'Service account key (JSON)' },
          },
        },
        [],
        null,
        true,
        new Map()
      )
    );

    expect(response.publicMetadata).toEqual(publicMetadata);
    expect(JSON.stringify(response)).not.toContain('stored-key-json');
  });

  it('maps a definition without origins to an empty origins list', () => {
    expect(
      mapCredentialDefinitionToApiDto({
        definitionId: 'snowflake',
        source: 'builtin',
        compatibilityLine: null,
        contract: {
          id: 'snowflake',
          displayName: 'Snowflake',
          description: '',
          category: 'snowflake',
          auth: { type: 'fields', fields: [] },
        },
      })
    ).toMatchObject({ origins: [], category: 'snowflake' });
  });

  it('returns the identity and canUse of a field set and none of its secret fields', async () => {
    const mapper = new CredentialMapper({
      fetchUserProjectionsList: jest.fn().mockResolvedValue([]),
    } as unknown as UserProjectionsFetcherService);
    const contract = BUILTIN_CREDENTIAL_DEFINITIONS.find(d => d.id === 'aws-access-key');
    const credential = {
      id: 'credential-1',
      projectId: 'project-1',
      title: 'AWS',
      secret: {
        fields: {
          secretAccessKey: 'stored-secret-access-key',
          sessionToken: 'stored-session-token',
        },
      },
      publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
      enabled: true,
      availableForUse: false,
      availableForMaintenance: false,
      aiModelMappings: null,
      owners: [],
      contexts: [],
      createdAt: new Date('2026-10-23T00:00:00Z'),
      modifiedAt: new Date('2026-10-23T00:00:00Z'),
    } as unknown as Credential;

    const dto = await mapper.toDto(
      credential,
      {
        definitionId: 'aws-access-key',
        source: 'builtin',
        compatibilityLine: null,
        contract: contract!,
      },
      [],
      null,
      true,
      new Map()
    );
    const response = mapper.toApiResponse(dto);

    expect(response).toMatchObject({
      identity: 'key-id-1',
      canUse: true,
      publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
      setSecretFieldKeys: ['secretAccessKey', 'sessionToken'],
    });
    expect(JSON.stringify(dto)).not.toMatch(/stored-secret-access-key|stored-session-token/);
    expect(JSON.stringify(response)).not.toMatch(/stored-secret-access-key|stored-session-token/);
  });

  it('returns a null identity when the definition names none', async () => {
    const mapper = new CredentialMapper({
      fetchUserProjectionsList: jest.fn().mockResolvedValue([]),
    } as unknown as UserProjectionsFetcherService);
    const contract = BUILTIN_CREDENTIAL_DEFINITIONS.find(d => d.id === 'databricks-token');
    const credential = {
      id: 'credential-1',
      projectId: 'project-1',
      title: 'Databricks',
      secret: { fields: { token: 'stored-databricks-token' } },
      publicMetadata: { fields: {} },
      owners: [],
      contexts: [],
    } as unknown as Credential;

    const dto = await mapper.toDto(
      credential,
      {
        definitionId: 'databricks-token',
        source: 'builtin',
        compatibilityLine: null,
        contract: contract!,
      },
      [],
      null,
      false,
      new Map()
    );

    expect(dto).toMatchObject({ identity: null, canUse: false, setSecretFieldKeys: ['token'] });
    expect(JSON.stringify(mapper.toApiResponse(dto))).not.toContain('stored-databricks-token');
  });

  it('titles each consumer the member can see and leaves the others null', async () => {
    const mapper = new CredentialMapper({
      fetchUserProjectionsList: jest.fn().mockResolvedValue([]),
    } as unknown as UserProjectionsFetcherService);
    const contract = BUILTIN_CREDENTIAL_DEFINITIONS.find(d => d.id === 'databricks-token');
    const binding = (consumerType: string, consumerId: string) =>
      ({
        consumerType,
        consumerId,
        requirementKey: 'storage',
        lastUsedAt: null,
      }) as unknown as CredentialConsumerBinding;

    const dto = await mapper.toDto(
      {
        id: 'credential-1',
        secret: { fields: {} },
        publicMetadata: null,
        owners: [],
        contexts: [],
      } as unknown as Credential,
      {
        definitionId: 'databricks-token',
        source: 'builtin',
        compatibilityLine: null,
        contract: contract!,
      },
      [
        binding('storage', 'visible-storage'),
        binding('storage', 'hidden-storage'),
        binding('plugin-installation', 'visible-storage'),
        binding('plugin-installation', 'own-installation'),
      ],
      null,
      false,
      new Map([
        ['storage', new Map([['visible-storage', 'Warehouse']])],
        ['plugin-installation', new Map([['own-installation', 'Slack digest']])],
      ])
    );

    expect(dto.usedBy.map(({ consumerId, title }) => ({ consumerId, title }))).toEqual([
      { consumerId: 'visible-storage', title: 'Warehouse' },
      { consumerId: 'hidden-storage', title: null },
      { consumerId: 'visible-storage', title: null },
      { consumerId: 'own-installation', title: 'Slack digest' },
    ]);
    expect(dto.setSecretFieldKeys).toEqual([]);
  });
});
