jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('../utils/sync-owners', () => ({
  syncOwners: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/resolve-owner-users', () => ({
  resolveOwnerUsers: jest.fn().mockReturnValue([]),
}));

import { CreateDataStorageService } from './create-data-storage.service';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { syncOwners } from '../utils/sync-owners';

describe('CreateDataStorageService', () => {
  const savedEntity = { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY, owners: [] };

  const createService = (env: Record<string, string> = {}) => {
    const dataStorageRepository = {
      create: jest.fn().mockReturnValue(savedEntity),
      save: jest.fn().mockResolvedValue(savedEntity),
    };
    const storageOwnerRepository = {};
    const dataStorageMapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'storage-1' }),
    };
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };
    const idpProjectionsFacade = {};

    const eventDispatcher = { publishLocalOnCommit: jest.fn() };
    const configService = { get: (key: string) => env[key] };

    const service = new CreateDataStorageService(
      dataStorageRepository as never,
      storageOwnerRepository as never,
      dataStorageMapper as never,
      userProjectionsFetcherService as never,
      idpProjectionsFacade as never,
      eventDispatcher as never,
      configService as never
    );

    return { service, dataStorageRepository, storageOwnerRepository, idpProjectionsFacade };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([{ DUCKDB_STORAGE_ENABLED: 'false' }, { DB_TYPE: 'mysql' }])(
    'refuses DUCKDB when the config gives %j',
    async env => {
      const { service, dataStorageRepository } = createService(env);
      const command = new CreateDataStorageCommand('proj-1', DataStorageType.DUCKDB, 'user-0');

      await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
      expect(dataStorageRepository.save).not.toHaveBeenCalled();
    }
  );

  it.each([{ DUCKDB_STORAGE_ENABLED: 'true' }, {}])(
    'creates a DuckDB storage with an empty config when the config gives %j',
    async env => {
      const { service, dataStorageRepository } = createService(env);

      await service.run(new CreateDataStorageCommand('proj-1', DataStorageType.DUCKDB, 'user-0'));

      expect(dataStorageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ config: {} })
      );
    }
  );

  it('creates other storage types without a config', async () => {
    const { service, dataStorageRepository } = createService();

    await service.run(
      new CreateDataStorageCommand('proj-1', DataStorageType.GOOGLE_BIGQUERY, 'user-0')
    );

    expect(dataStorageRepository.create.mock.calls[0][0]).not.toHaveProperty('config');
  });

  it('should call syncOwners with creator userId when ownerIds not provided', async () => {
    const { service } = createService();
    const command = new CreateDataStorageCommand(
      'proj-1',
      DataStorageType.GOOGLE_BIGQUERY,
      'user-0'
    );

    await service.run(command);

    expect(syncOwners).toHaveBeenCalledWith(
      expect.anything(),
      'storageId',
      'storage-1',
      'proj-1',
      ['user-0'],
      expect.anything(),
      expect.any(Function)
    );
  });

  it('should make a new storage available for use but private for maintenance by default', async () => {
    const { service, dataStorageRepository } = createService();
    const command = new CreateDataStorageCommand(
      'proj-1',
      DataStorageType.GOOGLE_BIGQUERY,
      'user-0'
    );

    await service.run(command);

    expect(dataStorageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        availableForUse: true,
        availableForMaintenance: false,
      })
    );
  });

  it('should call syncOwners with provided ownerIds', async () => {
    const { service } = createService();
    const command = new CreateDataStorageCommand(
      'proj-1',
      DataStorageType.GOOGLE_BIGQUERY,
      'user-0',
      ['user-1', 'user-2']
    );

    await service.run(command);

    expect(syncOwners).toHaveBeenCalledWith(
      expect.anything(),
      'storageId',
      'storage-1',
      'proj-1',
      ['user-1', 'user-2'],
      expect.anything(),
      expect.any(Function)
    );
  });
});
