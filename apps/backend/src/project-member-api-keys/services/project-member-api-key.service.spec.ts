import { IsNull, type Repository } from 'typeorm';
import { ProjectMemberApiKey } from '../entities/project-member-api-key.entity';
import { ProjectMemberApiKeyMapper } from '../mappers/project-member-api-key.mapper';
import { ProjectMemberApiKeyCryptoService } from './project-member-api-key-crypto.service';
import { ProjectMemberApiKeyService } from './project-member-api-key.service';

describe('ProjectMemberApiKeyService', () => {
  const createRepository = () =>
    ({
      create: jest.fn(data => data),
      save: jest.fn(entity => Promise.resolve({ ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
    }) as unknown as jest.Mocked<Repository<ProjectMemberApiKey>>;

  const createService = () => {
    const repository = createRepository();
    const cryptoService = new ProjectMemberApiKeyCryptoService();
    const mapper = new ProjectMemberApiKeyMapper();
    const service = new ProjectMemberApiKeyService(repository, cryptoService, mapper);

    return { service, repository, cryptoService, mapper };
  };

  it('creates a member-owned key without storing the API key secret', async () => {
    const { service, repository } = createService();

    const result = await service.createForMember(
      'project-1',
      'user-1',
      'CI import job',
      null,
      false,
      null
    );

    expect(result.metadata.apiKeyId).toMatch(/^pmk_[A-Za-z0-9_-]{22}$/);
    expect(result.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        userId: 'user-1',
        name: 'CI import job',
        role: null,
        readOnly: false,
        expiresAt: null,
        revokedAt: null,
        lastAuthenticatedAt: null,
        keyHash: expect.any(String),
        keyHashSalt: expect.any(String),
        keyHashParams: expect.objectContaining({ algorithm: 'scrypt' }),
      })
    );
    expect(repository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ secret: expect.any(String) })
    );
    expect(result.metadata).not.toHaveProperty('keyHash');
    expect(result.metadata).not.toHaveProperty('keyHashSalt');
    expect(result.metadata).not.toHaveProperty('keyHashParams');
  });

  it('can store an explicit requested role for future lower-role keys', async () => {
    const { service, repository } = createService();

    const result = await service.createForMember(
      'project-1',
      'user-1',
      'Read-only report sync',
      'viewer',
      true,
      null
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'viewer',
        readOnly: true,
      })
    );
    expect(result.metadata.role).toBe('viewer');
  });

  it('lists only active key metadata for the current project member by default', async () => {
    const { service, repository } = createService();
    const rows = [
      {
        apiKeyId: 'pmk_1234567890123456789012',
        keyHash: 'stored-hash',
        keyHashSalt: 'stored-salt',
        keyHashParams: { algorithm: 'scrypt' },
      },
    ] as unknown as ProjectMemberApiKey[];
    repository.find.mockResolvedValue(rows);

    const result = await service.listForMember('project-1', 'user-1', false);

    expect(repository.find).toHaveBeenCalledWith({
      where: { projectId: 'project-1', userId: 'user-1', revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    expect(result[0]).toEqual(expect.objectContaining({ apiKeyId: 'pmk_1234567890123456789012' }));
    expect(result[0]).not.toHaveProperty('keyHash');
    expect(result[0]).not.toHaveProperty('keyHashSalt');
    expect(result[0]).not.toHaveProperty('keyHashParams');
  });

  it('can include revoked keys for the current project member', async () => {
    const { service, repository } = createService();
    const rows = [
      {
        apiKeyId: 'pmk_1234567890123456789012',
        keyHash: 'stored-hash',
        keyHashSalt: 'stored-salt',
        keyHashParams: { algorithm: 'scrypt' },
      },
    ] as unknown as ProjectMemberApiKey[];
    repository.find.mockResolvedValue(rows);

    const result = await service.listForMember('project-1', 'user-1', true);

    expect(repository.find).toHaveBeenCalledWith({
      where: { projectId: 'project-1', userId: 'user-1' },
      order: { createdAt: 'DESC' },
    });
    expect(result[0]).toEqual(expect.objectContaining({ apiKeyId: 'pmk_1234567890123456789012' }));
  });

  it('scopes name updates by project id and user id', async () => {
    const { service, repository } = createService();
    const existing = {
      apiKeyId: 'pmk_1234567890123456789012',
      projectId: 'project-1',
      userId: 'user-1',
      name: 'old name',
    } as ProjectMemberApiKey;
    repository.findOne.mockResolvedValue(existing);
    repository.save.mockImplementation(entity => Promise.resolve(entity));

    const updated = await service.updateName(
      'project-1',
      'user-1',
      'pmk_1234567890123456789012',
      'new name'
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        userId: 'user-1',
        apiKeyId: 'pmk_1234567890123456789012',
      },
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'new name' }));
    expect(updated?.name).toBe('new name');
    expect(updated).not.toHaveProperty('keyHash');
  });

  it('does not update a key outside the current project member scope', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.updateName('project-1', 'user-1', 'pmk_1234567890123456789012', 'new name')
    ).resolves.toBeNull();

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('scopes revocation by project id and user id', async () => {
    const { service, repository } = createService();
    const existing = {
      apiKeyId: 'pmk_1234567890123456789012',
      projectId: 'project-1',
      userId: 'user-1',
      revokedAt: null,
    } as ProjectMemberApiKey;
    const revokedAt = new Date('2026-01-02T03:04:05.000Z');
    repository.findOne.mockResolvedValue(existing);
    repository.save.mockImplementation(entity => Promise.resolve(entity));

    const revoked = await service.revoke(
      'project-1',
      'user-1',
      'pmk_1234567890123456789012',
      revokedAt
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        userId: 'user-1',
        apiKeyId: 'pmk_1234567890123456789012',
      },
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ revokedAt }));
    expect(revoked?.revokedAt).toBe(revokedAt);
    expect(revoked).not.toHaveProperty('keyHash');
  });

  it('verifies credentials and returns token-issuing parameters without secret hash material', async () => {
    const { service, repository, cryptoService } = createService();
    const apiKeyId = 'pmk_1234567890123456789012';
    const apiKeySecret = 'vjqmM5GfJ6QklV8mFqM5Ior2hK6vK4mY8pE9T7aZr6Q';
    const row = {
      apiKeyId,
      projectId: 'project-1',
      userId: 'user-1',
      role: null,
      readOnly: true,
      expiresAt: null,
      revokedAt: null,
      keyHash: 'stored-hash',
      keyHashSalt: 'stored-salt',
      keyHashParams: {
        algorithm: 'scrypt',
        version: 1,
        keyLength: 64,
        cost: 16384,
        blockSize: 8,
        parallelization: 1,
      },
    } as ProjectMemberApiKey;
    repository.findOne.mockResolvedValue(row);
    jest.spyOn(cryptoService, 'verifySecret').mockResolvedValue(true);

    const result = await service.verifyCredential(apiKeyId, apiKeySecret);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { apiKeyId },
    });
    expect(cryptoService.verifySecret).toHaveBeenCalledWith(
      apiKeyId,
      apiKeySecret,
      expect.objectContaining({
        keyHash: 'stored-hash',
        keyHashSalt: 'stored-salt',
      })
    );
    expect(result).toEqual({
      apiKeyId,
      projectId: 'project-1',
      userId: 'user-1',
      role: null,
      readOnly: true,
    });
    expect(result).not.toHaveProperty('keyHash');
    expect(result).not.toHaveProperty('keyHashSalt');
    expect(result).not.toHaveProperty('keyHashParams');
  });

  it('marks successful API key authentication time', async () => {
    const { service, repository } = createService();
    const authenticatedAt = new Date('2026-01-02T03:04:05.000Z');
    const row = {
      apiKeyId: 'pmk_1234567890123456789012',
      lastAuthenticatedAt: null,
    } as ProjectMemberApiKey;
    repository.findOne.mockResolvedValue(row);
    repository.save.mockImplementation(entity => Promise.resolve(entity));

    const updated = await service.markAuthenticated('pmk_1234567890123456789012', authenticatedAt);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { apiKeyId: 'pmk_1234567890123456789012' },
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ lastAuthenticatedAt: authenticatedAt })
    );
    expect(updated?.lastAuthenticatedAt).toBe(authenticatedAt);
  });
});
