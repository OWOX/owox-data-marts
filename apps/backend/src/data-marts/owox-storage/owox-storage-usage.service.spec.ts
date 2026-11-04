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
    getSettings: () => ({
      freeStorageLimitBytes: GIB,
      paidIncludedStorageBytes: 10 * GIB,
      notPaidDeletionDays: 30,
      inactivityDeletionDays: 30,
    }),
  };
  const record = {
    storageId: 's1',
    projectId: 'project-1',
    datasetId: 'owox_abc',
    serviceAccountEmail: 'owox-st-abc@owox-storage.iam.gserviceaccount.com',
    storageLimitBytes: null,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    lastActivityAt: null,
    notPaidSince: null,
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

    describe('scheduled deletion', () => {
      const DAY = 86_400_000;
      const ago = (days: number) => new Date(Date.now() - days * DAY);
      const near = (date: Date, expected: Date) =>
        expect(Math.abs(date.getTime() - expected.getTime())).toBeLessThan(60_000);

      it('dates a NOT_PAID deletion from notPaidSince', async () => {
        plans.planFor.mockResolvedValue(ProjectPlanType.NOT_PAID);
        const notPaidSince = ago(3);

        const usage = await service.getUsage({ ...record, notPaidSince } as ManagedStorage);

        expect(usage.deletion?.reason).toBe('NOT_PAID');
        near(usage.deletion!.date, new Date(notPaidSince.getTime() + 30 * DAY));
        expect(usage.deletedAt).toBeNull();
      });

      it('shows no inactivity deletion before 7 idle days', async () => {
        const usage = await service.getUsage({
          ...record,
          lastActivityAt: ago(6),
        } as ManagedStorage);

        expect(usage.deletion).toBeNull();
      });

      it('shows the inactivity deletion after 8 idle days', async () => {
        const lastActivityAt = ago(8);

        const usage = await service.getUsage({ ...record, lastActivityAt } as ManagedStorage);

        expect(usage.deletion?.reason).toBe('INACTIVE');
        near(usage.deletion!.date, new Date(lastActivityAt.getTime() + 30 * DAY));
      });

      it('counts idle days from createdAt when there is no activity', async () => {
        const usage = await service.getUsage({ ...record, createdAt: ago(8) } as ManagedStorage);

        expect(usage.deletion?.reason).toBe('INACTIVE');
      });

      it('shows the inactivity deletion at exactly 7 idle days', async () => {
        const usage = await service.getUsage({
          ...record,
          lastActivityAt: new Date(Date.now() - 7 * DAY - 1000),
        } as ManagedStorage);

        expect(usage.deletion?.reason).toBe('INACTIVE');
      });

      it('stays quiet in the first week after leaving NOT_PAID', async () => {
        const usage = await service.getUsage({
          ...record,
          notPaidSince: ago(2),
          lastActivityAt: ago(40),
        } as ManagedStorage);

        expect(usage.deletion).toBeNull();
      });

      it('reports a deleted storage even when the plan cannot be read', async () => {
        plans.planFor.mockResolvedValue(null);
        const deprovisionedAt = ago(2);

        await expect(
          service.getUsage({ ...record, deprovisionedAt } as ManagedStorage)
        ).resolves.toMatchObject({ deletedAt: deprovisionedAt });
        expect(engine.listTables).not.toHaveBeenCalled();
      });

      it('never schedules a PAID deletion', async () => {
        plans.planFor.mockResolvedValue(ProjectPlanType.PAID);

        await expect(service.getUsage(record)).resolves.toMatchObject({ deletion: null });
      });

      it('reports a deleted storage without listing its tables', async () => {
        const deprovisionedAt = ago(2);

        const usage = await service.getUsage({ ...record, deprovisionedAt } as ManagedStorage);

        expect(usage).toMatchObject({
          deletedAt: deprovisionedAt,
          usedBytes: 0,
          tables: [],
          deletion: null,
        });
        expect(engine.listTables).not.toHaveBeenCalled();
      });
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

    it('refuses a load on NOT_PAID without reading sizes', async () => {
      plans.planFor.mockResolvedValue(ProjectPlanType.NOT_PAID);

      const error = await service.assertCanLoad('s1').catch(e => e);

      expect(error).toBeInstanceOf(ProjectOperationBlockedException);
      expect(error.blockedReasons).toEqual([ProjectBlockedReason.OWOX_STORAGE_NOT_PAID]);
      expect(error.message).toBe(
        "This project's subscription is not paid, so connector runs into its OWOX Storage are stopped. Pay for the subscription to resume them."
      );
      expect(engine.listTables).not.toHaveBeenCalled();
    });

    it('refuses a load on a deleted storage', async () => {
      managed.findByStorageId.mockResolvedValue({ ...record, deprovisionedAt: new Date() });

      const error = await service.assertCanLoad('s1').catch(e => e);

      expect(error).toBeInstanceOf(ProjectOperationBlockedException);
      expect(error.blockedReasons).toEqual([ProjectBlockedReason.OWOX_STORAGE_DELETED]);
      expect(error.message).toBe(
        "This project's OWOX Storage and its data were deleted. Restore the storage on its page to load data again."
      );
      expect(plans.planFor).not.toHaveBeenCalled();
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
