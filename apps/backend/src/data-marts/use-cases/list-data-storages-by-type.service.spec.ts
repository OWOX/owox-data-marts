import { ListDataStoragesByTypeCommand } from '../dto/domain/list-data-storages-by-type.command';
import { ListDataStoragesByTypeService } from './list-data-storages-by-type.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('ListDataStoragesByTypeService', () => {
  const makeQbChain = (rawResults: unknown[]) => {
    const qb = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      groupBy: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue(rawResults),
    };
    // Make chainable
    qb.leftJoin.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.select.mockReturnValue(qb);
    qb.addSelect.mockReturnValue(qb);
    qb.groupBy.mockReturnValue(qb);
    return qb;
  };

  const createService = (storages: unknown[], dataMartRaw: unknown[]) => {
    const qb = makeQbChain(dataMartRaw);

    const dataStorageRepo = {
      find: jest.fn().mockResolvedValue(storages),
    };
    const dataMartRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const service = new ListDataStoragesByTypeService(
      dataStorageRepo as never,
      dataMartRepo as never
    );

    return { service, dataStorageRepo, dataMartRepo, qb };
  };

  const projectId = 'proj-1';
  const type = DataStorageType.GOOGLE_BIGQUERY;

  it('returns items with correct fields when storages exist with credentials', async () => {
    const storages = [
      {
        id: 'storage-1',
        title: 'My BQ Storage',
        type,
        credentialId: 'cred-1',
        credential: { identity: { clientEmail: 'sa@project.iam.gserviceaccount.com' } },
      },
    ];
    const dataMartRaw = [{ storageId: 'storage-1', dataMartName: 'My Data Mart' }];

    const { service } = createService(storages, dataMartRaw);
    const command = new ListDataStoragesByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'storage-1',
      title: 'My BQ Storage',
      dataMartName: 'My Data Mart',
      identity: { clientEmail: 'sa@project.iam.gserviceaccount.com' },
    });
  });

  it('returns empty array when no storages match', async () => {
    const { service } = createService([], []);
    const command = new ListDataStoragesByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(result).toEqual([]);
  });

  it('returns dataMartName as null when no DataMart references the storage', async () => {
    const storages = [
      {
        id: 'storage-2',
        title: 'Unused Storage',
        type,
        credentialId: 'cred-2',
        credential: { identity: null },
      },
    ];

    const { service } = createService(storages, []); // no DataMart rows
    const command = new ListDataStoragesByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(result).toHaveLength(1);
    expect(result[0].dataMartName).toBeNull();
  });

  it('falls back to toHumanReadable when storage.title is null', async () => {
    const storages = [
      {
        id: 'storage-3',
        title: null,
        type: DataStorageType.SNOWFLAKE,
        credentialId: 'cred-3',
        credential: { identity: null },
      },
    ];

    const { service } = createService(storages, []);
    const command = new ListDataStoragesByTypeCommand(projectId, DataStorageType.SNOWFLAKE);

    const result = await service.run(command);

    expect(result[0].title).toBe('Snowflake');
  });

  it('returns identity from credential.identity', async () => {
    const identity = { email: 'user@example.com', name: 'Test User' };
    const storages = [
      {
        id: 'storage-4',
        title: 'OAuth Storage',
        type,
        credentialId: 'cred-4',
        credential: { identity },
      },
    ];

    const { service } = createService(storages, []);
    const command = new ListDataStoragesByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(result[0].identity).toEqual(identity);
  });

  it('returns empty array for unknown type string (no error)', async () => {
    const { service, dataStorageRepo } = createService([], []);
    dataStorageRepo.find.mockResolvedValue([]);

    const command = new ListDataStoragesByTypeCommand(projectId, 'UNKNOWN_TYPE' as never);

    const result = await service.run(command);

    expect(result).toEqual([]);
  });
});
