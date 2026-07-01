import { ProjectMemberApiKey } from '../entities/project-member-api-key.entity';
import { ProjectMemberApiKeyMapper } from './project-member-api-key.mapper';

describe('ProjectMemberApiKeyMapper', () => {
  const mapper = new ProjectMemberApiKeyMapper();

  it('maps API key entities to metadata without secret hash material', () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const modifiedAt = new Date('2026-01-03T03:04:05.000Z');
    const entity = {
      apiKeyId: 'pmk_1234567890123456789012',
      projectId: 'project-1',
      userId: 'user-1',
      name: 'CI import job',
      role: null,
      readOnly: false,
      expiresAt: null,
      revokedAt: null,
      lastAuthenticatedAt: null,
      keyHash: 'stored-hash',
      keyHashSalt: 'stored-salt',
      keyHashParams: { algorithm: 'scrypt' },
      createdAt,
      modifiedAt,
    } as ProjectMemberApiKey;

    const result = mapper.toMetadata(entity);

    expect(result).toEqual({
      apiKeyId: 'pmk_1234567890123456789012',
      projectId: 'project-1',
      userId: 'user-1',
      name: 'CI import job',
      role: null,
      readOnly: false,
      expiresAt: null,
      revokedAt: null,
      lastAuthenticatedAt: null,
      createdAt,
      modifiedAt,
    });
    expect(result).not.toHaveProperty('keyHash');
    expect(result).not.toHaveProperty('keyHashSalt');
    expect(result).not.toHaveProperty('keyHashParams');
  });

  it('maps API key entities to token-issuing parameters without secret hash material', () => {
    const entity = {
      apiKeyId: 'pmk_1234567890123456789012',
      projectId: 'project-1',
      userId: 'user-1',
      role: null,
      readOnly: true,
      keyHash: 'stored-hash',
      keyHashSalt: 'stored-salt',
      keyHashParams: { algorithm: 'scrypt' },
    } as ProjectMemberApiKey;

    const result = mapper.toIssuingParameters(entity);

    expect(result).toEqual({
      apiKeyId: 'pmk_1234567890123456789012',
      projectId: 'project-1',
      userId: 'user-1',
      role: null,
      readOnly: true,
    });
    expect(result).not.toHaveProperty('keyHash');
    expect(result).not.toHaveProperty('keyHashSalt');
    expect(result).not.toHaveProperty('keyHashParams');
  });
});
