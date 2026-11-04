import { IsNull, Not, Repository } from 'typeorm';
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
    deprovisionPending: false,
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
    update: jest.fn(),
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

  it.each([
    [1, true],
    [0, false],
  ])(
    'markRestored clears the deleted state only of a deleted record (%i row)',
    async (affected, result) => {
      const now = new Date('2026-11-02T10:00:00Z');
      repository.update.mockResolvedValue({ affected });

      expect(await service.markRestored('s1', now)).toBe(result);
      expect(repository.update).toHaveBeenCalledWith(
        { storageId: 's1', deprovisionedAt: Not(IsNull()) },
        {
          deprovisionedAt: null,
          deprovisionPending: false,
          notPaidSince: null,
          lastActivityAt: now,
        }
      );
    }
  );

  it.each([
    [1, true],
    [0, false],
  ])(
    'markDeleting marks only a record that is not deleted, as deleted and pending (%i row)',
    async (affected, result) => {
      const now = new Date('2026-11-02T10:00:00Z');
      repository.update.mockResolvedValue({ affected });

      expect(await service.markDeleting('s1', now)).toBe(result);
      expect(repository.update).toHaveBeenCalledWith(
        { storageId: 's1', deprovisionedAt: IsNull() },
        { deprovisionedAt: now, deprovisionPending: true }
      );
    }
  );

  it.each([true, false])(
    'setDeprovisionPending(%s) changes only a deleted record',
    async pending => {
      repository.update.mockResolvedValue({ affected: 1 });

      await service.setDeprovisionPending('s1', pending);

      expect(repository.update).toHaveBeenCalledWith(
        { storageId: 's1', deprovisionedAt: Not(IsNull()) },
        { deprovisionPending: pending }
      );
    }
  );

  it('findPendingDeprovision queries pending rows', async () => {
    const pending = { ...record('s1'), deprovisionPending: true };
    repository.find.mockResolvedValue([pending]);

    expect(await service.findPendingDeprovision()).toEqual([pending]);
    expect(repository.find).toHaveBeenCalledWith({ where: { deprovisionPending: true } });
  });

  it('findActive queries rows that are not deprovisioned', async () => {
    repository.find.mockResolvedValue([record('s1')]);

    expect(await service.findActive()).toEqual([record('s1')]);
    expect(repository.find).toHaveBeenCalledWith({ where: { deprovisionedAt: IsNull() } });
  });

  it.each([
    [1, true],
    [0, false],
  ])(
    'updateActive changes only a record that is not deleted (%i row)',
    async (affected, result) => {
      const now = new Date('2026-11-02T10:00:00Z');
      repository.update.mockResolvedValue({ affected });

      expect(await service.updateActive('s1', { lastActivityAt: now })).toBe(result);
      expect(repository.update).toHaveBeenCalledWith(
        { storageId: 's1', deprovisionedAt: IsNull() },
        { lastActivityAt: now }
      );
      expect(repository.save).not.toHaveBeenCalled();
    }
  );
});
