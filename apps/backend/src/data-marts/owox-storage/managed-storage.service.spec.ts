import { IsNull, Repository } from 'typeorm';
import { ManagedStorage } from '../entities/managed-storage.entity';
import { ManagedStorageService } from './managed-storage.service';

function record(storageId: string, projectId = 'project-1'): ManagedStorage {
  return {
    storageId,
    projectId,
    engine: 'bigquery',
    gcpProjectId: 'gcp-1',
    location: 'US',
    datasetId: 'owox_aaaaaaaaaaaa',
    internalDatasetId: 'owox_aaaaaaaaaaaa_internal',
    serviceAccountEmail: 'owox-st-aaaaaaaaaaaa@gcp-1.iam.gserviceaccount.com',
    storageLimitBytes: null,
    queryLimitBytesPerDay: null,
    notPaidSince: null,
    lastActivityAt: null,
    deprovisionedAt: null,
    createdAt: new Date(),
    modifiedAt: new Date(),
  };
}

describe('ManagedStorageService', () => {
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (value: unknown) => value),
    delete: jest.fn(),
  };
  const service = new ManagedStorageService(repository as unknown as Repository<ManagedStorage>);

  beforeEach(() => jest.clearAllMocks());

  it('findByStorageId returns null for an empty id without querying', async () => {
    expect(await service.findByStorageId('')).toBeNull();
    expect(await service.findByStorageId(undefined as unknown as string)).toBeNull();
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('findByStorageIds returns a map keyed by storageId', async () => {
    repository.find.mockResolvedValue([record('s1'), record('s2', 'project-2')]);

    const found = await service.findByStorageIds(['s1', 's2']);

    expect([...found.keys()]).toEqual(['s1', 's2']);
    expect(found.get('s2')?.projectId).toBe('project-2');
  });

  it('findByStorageIds skips the query for no ids', async () => {
    expect((await service.findByStorageIds([])).size).toBe(0);
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('returns null for an unknown storage', async () => {
    repository.findOne.mockResolvedValue(null);

    expect(await service.findByStorageId('missing')).toBeNull();
    expect(await service.findByProjectId('missing')).toBeNull();
  });

  it('create saves the record and remove deletes by storageId', async () => {
    const { createdAt, modifiedAt, ...input } = record('s1');
    void createdAt;
    void modifiedAt;

    await service.create(input);
    await service.remove('s1');

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ storageId: 's1' }));
    expect(repository.delete).toHaveBeenCalledWith({ storageId: 's1' });
  });

  it('findActive queries rows that are not deprovisioned', async () => {
    repository.find.mockResolvedValue([record('s1')]);

    expect(await service.findActive()).toEqual([record('s1')]);
    expect(repository.find).toHaveBeenCalledWith({ where: { deprovisionedAt: IsNull() } });
  });

  it('save passes the record to the repository', async () => {
    const row = record('s1');

    expect(await service.save(row)).toBe(row);
    expect(repository.save).toHaveBeenCalledWith(row);
  });
});
