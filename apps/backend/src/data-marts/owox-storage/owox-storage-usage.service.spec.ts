import { Logger } from '@nestjs/common';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { ProjectBlockedReason } from '../enums/project-blocked-reason.enum';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import { OwoxStorageUsageService } from './owox-storage-usage.service';

const GIB = 2 ** 30;

describe('OwoxStorageUsageService', () => {
  const engine = { listTables: jest.fn() };
  const managed = { findByStorageId: jest.fn() };
  const config = { getSettings: () => ({ storageLimitBytes: GIB }) };
  const record = {
    storageId: 's1',
    projectId: 'project-1',
    datasetId: 'owox_abc',
    serviceAccountEmail: 'owox-st-abc@owox-storage.iam.gserviceaccount.com',
    storageLimitBytes: null,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    lastActivityAt: null,
    deprovisionedAt: null,
  } as ManagedStorage;

  let service: OwoxStorageUsageService;
  let warn: jest.SpyInstance;
  const tables = (...sizes: number[]) =>
    engine.listTables.mockResolvedValue(
      sizes.map((sizeBytes, i) => ({ name: `t${i}`, sizeBytes, rowCount: 1 }))
    );

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new OwoxStorageUsageService(engine as never, managed as never, config as never);
    managed.findByStorageId.mockResolvedValue(record);
    tables(100, 200);
  });

  describe('table list cache', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('lists tables once within 60 s, again after forgetTables or past 60 s', async () => {
      await service.getUsage(record);
      await service.getUsage(record);
      expect(engine.listTables).toHaveBeenCalledTimes(1);

      service.forgetTables(record.storageId);
      await service.getUsage(record);
      expect(engine.listTables).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(60_001);
      await service.getUsage(record);
      expect(engine.listTables).toHaveBeenCalledTimes(3);
    });
  });

  describe('size gate', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('lists tables on every assertCanLoad but once for two panel reads within 60 s', async () => {
      await service.assertCanLoad('s1');
      await service.assertCanLoad('s1');
      expect(engine.listTables).toHaveBeenCalledTimes(2);

      engine.listTables.mockClear();
      service.forgetTables('s1');
      await service.getUsage(record);
      await service.getUsage(record);
      expect(engine.listTables).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUsage', () => {
    it('sums table sizes against the storage limit, with no plan and no deletion date', async () => {
      const usage = await service.getUsage(record);

      expect(usage).toEqual({
        usedBytes: 300,
        limitBytes: GIB,
        tables: [
          { name: 't0', sizeBytes: 100, rowCount: 1 },
          { name: 't1', sizeBytes: 200, rowCount: 1 },
        ],
        deletedAt: null,
      });
    });

    it("prefers the record's storageLimitBytes", async () => {
      await expect(
        service.getUsage({ ...record, storageLimitBytes: 5 * GIB } as ManagedStorage)
      ).resolves.toMatchObject({ limitBytes: 5 * GIB });
    });

    it('reports a deleted storage without listing its tables', async () => {
      const deprovisionedAt = new Date('2026-11-20T00:00:00Z');

      const usage = await service.getUsage({ ...record, deprovisionedAt } as ManagedStorage);

      expect(usage).toMatchObject({ deletedAt: deprovisionedAt, usedBytes: 0, tables: [] });
      expect(engine.listTables).not.toHaveBeenCalled();
    });

    it('propagates a failed read', async () => {
      engine.listTables.mockRejectedValue(new Error('Access Denied'));

      await expect(service.getUsage(record)).rejects.toThrow('Access Denied');
    });
  });

  describe('assertCanLoad', () => {
    it('does nothing for a storage without a record', async () => {
      managed.findByStorageId.mockResolvedValue(null);

      await expect(service.assertCanLoad('regular')).resolves.toBeUndefined();
      expect(engine.listTables).not.toHaveBeenCalled();
    });

    it('refuses a storage at its limit', async () => {
      tables(GIB);

      const error = await service.assertCanLoad('s1').catch(e => e);

      expect(error).toBeInstanceOf(ProjectOperationBlockedException);
      expect(error.blockedReasons).toEqual([ProjectBlockedReason.OWOX_STORAGE_FULL]);
      expect(error.message).toBe(
        "This project's OWOX Storage has reached its size limit. Delete tables in the storage to load more data, or contact support to get a higher limit."
      );
    });

    it('lets a storage below its limit load', async () => {
      tables(GIB - 1);

      await expect(service.assertCanLoad('s1')).resolves.toBeUndefined();
    });

    it('refuses a load on a deleted storage', async () => {
      managed.findByStorageId.mockResolvedValue({ ...record, deprovisionedAt: new Date() });

      const error = await service.assertCanLoad('s1').catch(e => e);

      expect(error).toBeInstanceOf(ProjectOperationBlockedException);
      expect(error.blockedReasons).toEqual([ProjectBlockedReason.OWOX_STORAGE_DELETED]);
      expect(error.message).toBe(
        "This project's OWOX Storage and its data were deleted. Restore the storage on its page to load data again."
      );
      expect(engine.listTables).not.toHaveBeenCalled();
    });

    it('lets the run go when the size cannot be read', async () => {
      engine.listTables.mockRejectedValue(new Error('Access Denied'));

      await expect(service.assertCanLoad('s1')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('owox_abc');
      expect(warn.mock.calls[0][0]).not.toContain('@');
    });
  });
});
