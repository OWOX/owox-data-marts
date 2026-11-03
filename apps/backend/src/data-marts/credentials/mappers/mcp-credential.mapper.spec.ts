import type { CredentialDefinitionApiDto } from '../dto/credential-api.dto';
import type { CredentialDto } from '../dto/credential.dto';
import { McpCredentialMapper } from './mcp-credential.mapper';

const date = new Date('2026-11-02T10:00:00Z');
const definition = {
  id: 'provider',
  source: 'external',
  displayName: 'Provider',
  description: 'API access',
  documentationUrl: null,
  category: 'other',
  connectors: ['CustomApi'],
  storageTypes: [],
  destinationTypes: [],
  supportsAi: false,
  compatibilityLine: 'v2',
  auth: { type: 'fields', fields: [{ key: 'private-field', default: 'secret-marker' }] },
  secretLabel: 'private-label',
  origins: ['https://private.example'],
  ai: { internal: 'secret-marker' },
} as unknown as CredentialDefinitionApiDto;

describe('McpCredentialMapper', () => {
  const mapper = new McpCredentialMapper();

  it('allowlists definitions without authentication contracts or provider configuration', () => {
    expect(mapper.toDefinition(definition)).toEqual({
      id: 'provider',
      source: 'external',
      displayName: 'Provider',
      description: 'API access',
      documentationUrl: null,
      category: 'other',
      connectors: ['CustomApi'],
      storageTypes: [],
      destinationTypes: [],
      authType: 'fields',
      supportsAi: false,
      compatibilityLine: 'v2',
    });
  });

  it('maps resolved definitions at the presentation boundary', () => {
    const result = mapper.toResolvedDefinition({
      definitionId: 'provider',
      source: 'external',
      compatibilityLine: 'v2',
      contract: {
        id: 'provider',
        displayName: 'Provider',
        description: 'API access',
        category: 'other',
        connectors: [],
        auth: { type: 'header', headerName: 'Authorization', prefix: 'Bearer ', label: 'API key' },
        origins: ['https://private.example'],
      },
    });
    expect(result).toMatchObject({ id: 'provider', authType: 'header', compatibilityLine: 'v2' });
    expect(result).not.toHaveProperty('auth');
    expect(result).not.toHaveProperty('origins');
  });

  it('removes stored provider facts and counts hidden consumers without their identifiers', () => {
    const dto = {
      id: 'credential',
      projectId: 'project',
      title: 'My API',
      definition,
      definitionConsentRequired: true,
      enabled: true,
      availableForUse: false,
      availableForMaintenance: false,
      validationState: 'rejected',
      validatedAt: date,
      lastUsedAt: null,
      aiModelMappings: { fast: 'model-1', private: 'secret-marker' },
      aiModelMappingModes: { fast: 'override' },
      canUse: true,
      ownerUsers: [{ userId: 'owner', email: 'private-user-marker' }],
      contexts: [{ id: 'context', title: 'Context' }],
      usedBy: [
        {
          consumerType: 'storage',
          consumerId: 'visible',
          title: 'Warehouse',
          requirementKey: 'key',
          lastUsedAt: date,
        },
        {
          consumerType: 'plugin',
          consumerId: 'hidden-id-marker',
          title: null,
          requirementKey: 'hidden-key-marker',
          lastUsedAt: date,
        },
      ],
      createdAt: date,
      modifiedAt: date,
      publicMetadata: { fields: { account: 'secret-marker' } },
      identity: 'secret-marker',
      validationMessage: 'Provider echoed secret-marker',
      setSecretFieldKeys: ['private-field'],
      secret: { value: 'secret-marker' },
    } as unknown as CredentialDto;

    const result = mapper.toCredential(dto);

    expect(result).toMatchObject({
      id: 'credential',
      title: 'My API',
      ownerIds: ['owner'],
      contextIds: ['context'],
      hiddenConsumerCount: 1,
      usedBy: [
        {
          consumerType: 'storage',
          consumerId: 'visible',
          title: 'Warehouse',
          requirementKey: 'key',
          lastUsedAt: date,
        },
      ],
      validationState: 'rejected',
      aiModelMappings: { fast: 'model-1' },
    });
    expect(result.usedBy).toHaveLength(1);
    const json = JSON.stringify(result);
    for (const forbidden of [
      'secret-marker',
      'hidden-id-marker',
      'hidden-key-marker',
      'private-field',
      'private-user-marker',
      'validationMessage',
      'publicMetadata',
      'setSecretFieldKeys',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('allowlists unavailable definitions instead of returning the source object', () => {
    const input = {
      id: 'missing',
      projectId: 'project',
      title: 'Old provider',
      definitionId: 'old',
      state: 'unavailable' as const,
      createdAt: date,
      modifiedAt: date,
      secret: 'secret-marker',
    };
    expect(mapper.toListItem(input)).toEqual({
      id: 'missing',
      title: 'Old provider',
      definitionId: 'old',
      state: 'unavailable',
      createdAt: date,
      modifiedAt: date,
    });
  });
});
