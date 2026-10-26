import { ListDataStoragesByTypeCommand } from '../dto/domain/list-data-storages-by-type.command';
import { ListDataStoragesByTypeService } from './list-data-storages-by-type.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';

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

  const createService = (
    storages: unknown[],
    dataMartRaw: unknown[],
    bound: Record<string, string | null> = {}
  ) => {
    const qb = makeQbChain(dataMartRaw);

    const dataStorageRepo = {
      find: jest.fn().mockResolvedValue(storages),
    };
    const dataMartRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    // A member who can see every bound Credential.
    const storageCredentials = {
      findBoundStorageIds: jest.fn().mockResolvedValue(new Set(Object.keys(bound))),
      summarizeForStorages: jest
        .fn()
        .mockResolvedValue(
          new Map(
            Object.entries(bound).map(([id, identity]) => [
              id,
              { access: 'visible', id: `cred-${id}`, identity, state: 'ready' },
            ])
          )
        ),
    };
    const service = new ListDataStoragesByTypeService(
      dataStorageRepo as never,
      dataMartRepo as never,
      storageCredentials as never,
      new LegacyStorageCredentialReader({} as never, {} as never, {} as never, {} as never)
    );

    return { service, dataStorageRepo, dataMartRepo, qb, storageCredentials };
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

  it('lists a bound Storage without an old row, with its identity from the Credential', async () => {
    const storages = [
      { id: 'bound', title: 'Bound', type, credentialId: null, credential: null },
      { id: 'sa', title: 'Bound SA', type, credentialId: null, credential: null },
      { id: 'unconfigured', title: 'Empty', type, credentialId: null, credential: null },
    ];
    const { service } = createService(storages, [], {
      bound: 'me@example.com',
      sa: 'robot@p.iam.gserviceaccount.com',
    });

    const result = await service.run(new ListDataStoragesByTypeCommand(projectId, type));

    expect(result.map(r => [r.id, r.identity])).toEqual([
      ['bound', { email: 'me@example.com' }],
      ['sa', { clientEmail: 'robot@p.iam.gserviceaccount.com' }],
    ]);
  });

  it('maps a bound Snowflake identity to { username } and an AWS one to { accessKeyId }', async () => {
    const storages = [
      { id: 'snow', title: 'Snow', type: DataStorageType.SNOWFLAKE, credentialId: null },
      { id: 'athena', title: 'Athena', type: DataStorageType.AWS_ATHENA, credentialId: null },
      { id: 'redshift', title: 'Redshift', type: DataStorageType.AWS_REDSHIFT, credentialId: null },
    ];
    const { service } = createService(storages, [], {
      snow: 'LOADER',
      athena: 'AKIA1',
      redshift: 'AKIA2',
    });

    const result = await service.run(new ListDataStoragesByTypeCommand(projectId, type));

    expect(result.map(r => [r.id, r.identity])).toEqual([
      ['snow', { username: 'LOADER' }],
      ['athena', { accessKeyId: 'AKIA1' }],
      ['redshift', { accessKeyId: 'AKIA2' }],
    ]);
  });

  it("returns a bound Credential's identity only to a member who can see it", async () => {
    const storages = [
      { id: 'seen', title: 'Seen', type, credentialId: null },
      { id: 'hidden', title: 'Hidden', type, credentialId: null },
    ];
    const { service, storageCredentials } = createService(storages, []);
    storageCredentials.summarizeForStorages.mockResolvedValue(
      new Map([
        ['seen', { access: 'visible', id: 'c1', identity: 'me@example.com', state: 'ready' }],
        ['hidden', { access: 'restricted', state: 'ready' }],
      ])
    );
    storageCredentials.findBoundStorageIds.mockResolvedValue(new Set(['seen', 'hidden']));

    const result = await service.run(
      new ListDataStoragesByTypeCommand(projectId, type, 'member-1', ['editor'])
    );

    expect(storageCredentials.summarizeForStorages).toHaveBeenCalledWith({
      projectId,
      userId: 'member-1',
      roles: ['editor'],
      storages,
    });
    expect(result.map(r => [r.id, r.identity])).toEqual([
      ['seen', { email: 'me@example.com' }],
      ['hidden', null],
    ]);
  });

  it("never returns a bound Credential's identity to a plugin", async () => {
    const storages = [{ id: 'bound', title: 'Bound', type, credentialId: null }];
    const { service, storageCredentials } = createService(storages, [], {
      bound: 'me@example.com',
    });

    const result = await service.run(
      new ListDataStoragesByTypeCommand(projectId, type, 'member-1', ['editor'], true)
    );

    expect(result.map(r => [r.id, r.identity])).toEqual([['bound', null]]);
    expect(storageCredentials.summarizeForStorages).not.toHaveBeenCalled();
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
