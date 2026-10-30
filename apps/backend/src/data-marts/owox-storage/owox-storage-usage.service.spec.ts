import { Logger } from '@nestjs/common';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { ProjectBlockedReason } from '../enums/project-blocked-reason.enum';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import { OwoxStorageUsageService } from './owox-storage-usage.service';

const GIB = 2 ** 30;

describe('OwoxStorageUsageService', () => {
  const engine = { listTables: jest.fn() };
  const plans = { planFor: jest.fn() };
  const managed = { findByStorageId: jest.fn() };
  const config = {
    getSettings: () => ({ freeStorageLimitBytes: GIB, paidIncludedStorageBytes: 10 * GIB }),
  };
  const record = {
    storageId: 's1',
    projectId: 'project-1',
    datasetId: 'owox_abc',
    serviceAccountEmail: 'owox-st-abc@owox-storage.iam.gserviceaccount.com',
    storageLimitBytes: null,
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
    service = new OwoxStorageUsageService(
      engine as never,
      plans as never,
      managed as never,
      config as never
    );
    plans.planFor.mockResolvedValue(ProjectPlanType.FREE);
    managed.findByStorageId.mockResolvedValue(record);
    tables(100, 200);
  });

  describe('getUsage', () => {
    it('sums table sizes against the FREE limit', async () => {
      await expect(service.getUsage(record)).resolves.toMatchObject({
        plan: ProjectPlanType.FREE,
        usedBytes: 300,
        limitBytes: GIB,
        tables: [
          { name: 't0', sizeBytes: 100, rowCount: 1 },
          { name: 't1', sizeBytes: 200, rowCount: 1 },
        ],
      });
    });

    it('reports the PAID included volume', async () => {
      plans.planFor.mockResolvedValue(ProjectPlanType.PAID);

      await expect(service.getUsage(record)).resolves.toMatchObject({
        plan: ProjectPlanType.PAID,
        limitBytes: 10 * GIB,
      });
    });

    it('gives NOT_PAID the FREE limit', async () => {
      plans.planFor.mockResolvedValue(ProjectPlanType.NOT_PAID);

      await expect(service.getUsage(record)).resolves.toMatchObject({ limitBytes: GIB });
    });

    it("prefers the record's storageLimitBytes", async () => {
      plans.planFor.mockResolvedValue(ProjectPlanType.PAID);

      await expect(
        service.getUsage({ ...record, storageLimitBytes: 5 * GIB } as ManagedStorage)
      ).resolves.toMatchObject({ limitBytes: 5 * GIB });
    });

    it('throws when the plan cannot be read', async () => {
      plans.planFor.mockResolvedValue(null);

      await expect(service.getUsage(record)).rejects.toThrow();
    });

    it('propagates a failed read', async () => {
      engine.listTables.mockRejectedValue(new Error('Access Denied'));

      await expect(service.getUsage(record)).rejects.toThrow('Access Denied');
    });
  });

  describe('assertCanLoad', () => {
    it('lets the run go when the plan cannot be read', async () => {
      plans.planFor.mockResolvedValue(null);

      await expect(service.assertCanLoad('s1')).resolves.toBeUndefined();
      expect(engine.listTables).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).not.toContain('@');
    });

    it('does nothing for a storage without a record', async () => {
      managed.findByStorageId.mockResolvedValue(null);

      await expect(service.assertCanLoad('regular')).resolves.toBeUndefined();
      expect(engine.listTables).not.toHaveBeenCalled();
    });

    it('refuses a FREE storage at its limit', async () => {
      tables(GIB);

      const error = await service.assertCanLoad('s1').catch(e => e);

      expect(error).toBeInstanceOf(ProjectOperationBlockedException);
      expect(error.blockedReasons).toEqual([ProjectBlockedReason.OWOX_STORAGE_FULL]);
      expect(error.message).toBe(
        "This project's OWOX Storage has reached its size limit. Delete tables in the storage or upgrade the plan to load more data."
      );
    });

    it('lets a FREE storage below its limit load', async () => {
      tables(GIB - 1);

      await expect(service.assertCanLoad('s1')).resolves.toBeUndefined();
    });

    it('never refuses PAID', async () => {
      plans.planFor.mockResolvedValue(ProjectPlanType.PAID);
      tables(50 * GIB);

      await expect(service.assertCanLoad('s1')).resolves.toBeUndefined();
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
