import { In, Repository } from 'typeorm';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorSourceCredentials } from '../../entities/connector-source-credentials.entity';

describe('ConnectorSourceCredentialsService', () => {
  const createService = () => {
    const repository = {
      create: jest.fn().mockImplementation(data => data),
      save: jest.fn().mockImplementation(data => Promise.resolve({ ...data, id: 'cred-1' })),
      findOne: jest.fn(),
      find: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    } as unknown as Repository<ConnectorSourceCredentials>;

    const service = new ConnectorSourceCredentialsService(repository);

    return { service, repository };
  };

  describe('createCredentials', () => {
    it('creates and saves a credential entity', async () => {
      const { service, repository } = createService();

      const result = await service.createCredentials(
        'proj-1',
        'user-1',
        'TestConnector',
        { accessToken: 'tok' },
        null
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          userId: 'user-1',
          connectorName: 'TestConnector',
          credentials: { accessToken: 'tok' },
          expiresAt: null,
        })
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result.id).toBe('cred-1');
    });
  });

  describe('getCredentialsById', () => {
    it('returns credential when found', async () => {
      const { service, repository } = createService();
      const mockCred = {
        id: 'cred-1',
        connectorName: 'TestConnector',
      } as ConnectorSourceCredentials;
      (repository.findOne as jest.Mock).mockResolvedValue(mockCred);

      const result = await service.getCredentialsById('cred-1');

      expect(result).toBe(mockCred);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 'cred-1' } });
    });

    it('returns null when not found', async () => {
      const { service, repository } = createService();
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.getCredentialsById('missing');

      expect(result).toBeNull();
    });
  });

  describe('createSecretsForConfig', () => {
    it('creates entity with correct fields', async () => {
      const { service, repository } = createService();

      const result = await service.createSecretsForConfig(
        'proj-1',
        'TestConnector',
        'dm-1',
        'cfg-1',
        { 'AuthType.oauth2.RefreshToken': 'tok123' },
        'user-1'
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          connectorName: 'TestConnector',
          dataMartId: 'dm-1',
          configId: 'cfg-1',
          credentials: { 'AuthType.oauth2.RefreshToken': 'tok123' },
          userId: 'user-1',
        })
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result.id).toBe('cred-1');
    });
  });

  describe('getSecretsByDataMartAndConfig', () => {
    it('returns entity when found', async () => {
      const { service, repository } = createService();
      const mockEntity = {
        id: 'cred-1',
        dataMartId: 'dm-1',
        configId: 'cfg-1',
      } as ConnectorSourceCredentials;
      (repository.findOne as jest.Mock).mockResolvedValue(mockEntity);

      const result = await service.getSecretsByDataMartAndConfig('dm-1', 'cfg-1');

      expect(result).toBe(mockEntity);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { dataMartId: 'dm-1', configId: 'cfg-1' },
      });
    });

    it('returns null when not found', async () => {
      const { service, repository } = createService();
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.getSecretsByDataMartAndConfig('dm-1', 'cfg-missing');

      expect(result).toBeNull();
    });
  });

  describe('updateSecretsForConfig', () => {
    it('updates credentials when found and projectId matches', async () => {
      const { service, repository } = createService();
      const existing = {
        id: 'cred-1',
        projectId: 'proj-1',
        credentials: { oldKey: 'oldValue' },
      } as unknown as ConnectorSourceCredentials;
      (repository.findOne as jest.Mock).mockResolvedValue(existing);
      (repository.save as jest.Mock).mockResolvedValue({
        ...existing,
        credentials: { newKey: 'newValue' },
      });

      const result = await service.updateSecretsForConfig('cred-1', 'proj-1', {
        newKey: 'newValue',
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ credentials: { newKey: 'newValue' } })
      );
      expect(result.credentials).toEqual({ newKey: 'newValue' });
    });

    it('throws when entity not found', async () => {
      const { service, repository } = createService();
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateSecretsForConfig('missing-id', 'proj-1', { key: 'val' })
      ).rejects.toThrow('ConnectorSourceCredentials with id missing-id not found');
    });

    it('throws when projectId does not match', async () => {
      const { service, repository } = createService();
      const existing = {
        id: 'cred-1',
        projectId: 'other-proj',
        credentials: {},
      } as unknown as ConnectorSourceCredentials;
      (repository.findOne as jest.Mock).mockResolvedValue(existing);

      await expect(
        service.updateSecretsForConfig('cred-1', 'proj-1', { key: 'val' })
      ).rejects.toThrow('Unauthorized: secrets do not belong to this project');
    });
  });

  describe('deleteSecretsByDataMart', () => {
    it('soft deletes by dataMartId', async () => {
      const { service, repository } = createService();

      await service.deleteSecretsByDataMart('dm-1');

      expect(repository.softDelete).toHaveBeenCalledWith({ dataMartId: 'dm-1' });
    });
  });

  describe('getSecretsByDataMart', () => {
    it('returns array of entities for a dataMartId', async () => {
      const { service, repository } = createService();
      const mockEntities = [
        { id: 'cred-1', dataMartId: 'dm-1' },
        { id: 'cred-2', dataMartId: 'dm-1' },
      ] as ConnectorSourceCredentials[];
      (repository.find as jest.Mock).mockResolvedValue(mockEntities);

      const result = await service.getSecretsByDataMart('dm-1');

      expect(result).toBe(mockEntities);
      expect(repository.find).toHaveBeenCalledWith({ where: { dataMartId: 'dm-1' } });
    });
  });

  describe('getCredentialsByIds', () => {
    it('returns a Map of id to entity', async () => {
      const { service, repository } = createService();
      const mockEntities = [
        { id: 'cred-1', connectorName: 'TestConnector' },
        { id: 'cred-2', connectorName: 'OtherConnector' },
      ] as ConnectorSourceCredentials[];
      (repository.find as jest.Mock).mockResolvedValue(mockEntities);

      const result = await service.getCredentialsByIds(['cred-1', 'cred-2']);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('cred-1')).toBe(mockEntities[0]);
      expect(result.get('cred-2')).toBe(mockEntities[1]);
      expect(repository.find).toHaveBeenCalledWith({ where: { id: In(['cred-1', 'cred-2']) } });
    });

    it('returns empty Map for empty ids array', async () => {
      const { service, repository } = createService();

      const result = await service.getCredentialsByIds([]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(repository.find).not.toHaveBeenCalled();
    });
  });

  describe('isExpired', () => {
    it('returns false when expiresAt is null (never expires)', async () => {
      const { service, repository } = createService();
      (repository.findOne as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        expiresAt: null,
      });

      const result = await service.isExpired('cred-1');

      expect(result).toBe(false);
    });

    it('returns false when expiresAt is in the future', async () => {
      const { service, repository } = createService();
      const futureDate = new Date(Date.now() + 1000 * 60 * 60);
      (repository.findOne as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        expiresAt: futureDate,
      });

      const result = await service.isExpired('cred-1');

      expect(result).toBe(false);
    });

    it('returns true when expiresAt is in the past', async () => {
      const { service, repository } = createService();
      const pastDate = new Date(Date.now() - 1000 * 60 * 60);
      (repository.findOne as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        expiresAt: pastDate,
      });

      const result = await service.isExpired('cred-1');

      expect(result).toBe(true);
    });

    it('returns true when credential is not found', async () => {
      const { service, repository } = createService();
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.isExpired('non-existent');

      expect(result).toBe(true);
    });
  });
});
