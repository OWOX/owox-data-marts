import { Logger } from '@nestjs/common';
import { OwoxStorageScanBudgetService } from './owox-storage-scan-budget.service';
import {
  OwoxStorageQueryLimitException,
  OwoxStorageUsageUnavailableException,
} from './owox-storage.exceptions';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import type { ManagedStorage } from '../entities/managed-storage.entity';

const GIB = 2 ** 30;
const LIMIT_USED =
  "This project has used today's OWOX Storage query limit. It resets at midnight Pacific Time.";
const TOO_LARGE =
  "This query would scan more than what is left of today's OWOX Storage query limit. It resets at midnight Pacific Time.";

describe('OwoxStorageScanBudgetService', () => {
  const query = jest.fn();
  const identity = { bigQuery: jest.fn(() => ({ query })) };
  const plans = { planFor: jest.fn() };
  const config = {
    getSettings: () => ({
      freeQueryLimitBytesPerDay: 10 * GIB,
      paidQueryLimitBytesPerDay: 100 * GIB,
    }),
  };
  const record = {
    storageId: 's1',
    projectId: 'project-1',
    gcpProjectId: 'owox-storage',
    location: 'EU',
    serviceAccountEmail: 'owox-st-abc@owox-storage.iam.gserviceaccount.com',
    queryLimitBytesPerDay: null,
  } as ManagedStorage;

  let service: OwoxStorageScanBudgetService;
  const used = (bytes: unknown) => query.mockResolvedValue([[{ used: bytes }]]);
  const plan = (type: ProjectPlanType) => plans.planFor.mockResolvedValue(type);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new OwoxStorageScanBudgetService(identity as never, config as never, plans as never);
    used(0);
    plan(ProjectPlanType.FREE);
  });

  it("reads the storage account's usage in its region since midnight Pacific Time", async () => {
    used(GIB);

    await expect(service.forStorage(record).remainingBytes()).resolves.toBe(9 * GIB);
    expect(identity.bigQuery).toHaveBeenCalledWith('owox-storage', 'EU');
    const [options] = query.mock.calls[0];
    expect(options.query).toContain('`owox-storage.region-eu.INFORMATION_SCHEMA.JOBS_BY_PROJECT`');
    expect(options.query).toContain("CURRENT_DATE('America/Los_Angeles'), 'America/Los_Angeles'");
    expect(options.params).toEqual({ email: record.serviceAccountEmail });
  });

  it('refuses at the limit', async () => {
    used(10 * GIB);

    await expect(service.forStorage(record).remainingBytes()).rejects.toThrow(
      OwoxStorageQueryLimitException
    );
    await expect(service.forStorage(record).reserve(0)).rejects.toThrow(LIMIT_USED);
  });

  it('leaves script parent jobs out of the usage', async () => {
    await service.forStorage(record).remainingBytes();

    expect(query.mock.calls[0][0].query).toContain("AND IFNULL(statement_type, '') != 'SCRIPT'");
  });

  it('holds a reservation until release and then counts it as used today', async () => {
    jest.useFakeTimers();
    try {
      const budget = service.forStorage(record);
      const first = await budget.reserve(6 * GIB);
      expect(first.maximumBytesBilled).toBe(10 * GIB);

      const second = budget.reserve(6 * GIB);
      await expect(second).rejects.toBeInstanceOf(OwoxStorageQueryLimitException);
      await expect(second).rejects.toThrow(TOO_LARGE);

      first.release();
      await expect(budget.remainingBytes()).resolves.toBe(4 * GIB);
      first.release();
      await expect(budget.remainingBytes()).resolves.toBe(4 * GIB);
      expect(query).toHaveBeenCalledTimes(1);

      // The next usage read already holds the finished job, and nothing is in flight any more.
      used(6 * GIB);
      jest.advanceTimersByTime(61_000);
      await expect(budget.remainingBytes()).resolves.toBe(4 * GIB);
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('lets only one of two concurrent reservations take the same bytes', async () => {
    const budget = service.forStorage(record);

    const results = await Promise.allSettled([budget.reserve(6 * GIB), budget.reserve(6 * GIB)]);

    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('subtracts reservations in flight from what is left', async () => {
    const budget = service.forStorage(record);
    await budget.reserve(3 * GIB);

    await expect(budget.remainingBytes()).resolves.toBe(7 * GIB);
  });

  it('accepts an estimate equal to what is left', async () => {
    used(4 * GIB);
    const budget = service.forStorage(record);

    await expect(budget.reserve(6 * GIB)).resolves.toMatchObject({ maximumBytesBilled: 6 * GIB });
    await expect(budget.remainingBytes()).rejects.toThrow(LIMIT_USED);
  });

  it('refuses a reservation when the usage cannot be read', async () => {
    query.mockRejectedValue(new Error('Access Denied'));

    await expect(service.forStorage(record).reserve(GIB)).rejects.toThrow(
      OwoxStorageUsageUnavailableException
    );
  });

  it('uses the PAID limit and the record override', async () => {
    plan(ProjectPlanType.PAID);
    await expect(service.forStorage(record).remainingBytes()).resolves.toBe(100 * GIB);

    plans.planFor.mockClear();
    const overridden = {
      ...record,
      storageId: 's2',
      projectId: 'project-2',
      queryLimitBytesPerDay: GIB,
    };
    await expect(service.forStorage(overridden).remainingBytes()).resolves.toBe(GIB);
    expect(plans.planFor).not.toHaveBeenCalled();
  });

  it('returns a whole number of bytes under a fractional limit', async () => {
    const fractional = { getSettings: () => ({ freeQueryLimitBytesPerDay: 0.1 * GIB }) };
    service = new OwoxStorageScanBudgetService(
      identity as never,
      fractional as never,
      plans as never
    );

    await expect(service.forStorage(record).remainingBytes()).resolves.toBe(107374182);
  });

  it('refuses instead of returning NaN when the usage is not a number', async () => {
    used('not a number');

    await expect(service.forStorage(record).remainingBytes()).rejects.toThrow(
      OwoxStorageUsageUnavailableException
    );
  });

  it('NOT_PAID uses the FREE limit', async () => {
    plan(ProjectPlanType.NOT_PAID);

    await expect(service.forStorage(record).remainingBytes()).resolves.toBe(10 * GIB);
  });

  it('uses the FREE limit when the plan cannot be read', async () => {
    plans.planFor.mockResolvedValue(null);

    await expect(service.forStorage(record).remainingBytes()).resolves.toBe(10 * GIB);
  });

  it('reuses the usage read for 60 s', async () => {
    jest.useFakeTimers();
    try {
      const budget = service.forStorage(record);
      await budget.remainingBytes();
      jest.advanceTimersByTime(59_000);
      await budget.remainingBytes();
      expect(query).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(2_000);
      await budget.remainingBytes();
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks for the plan of the storage project and reads usage per storage', async () => {
    await service.forStorage(record).remainingBytes();
    await service.forStorage({ ...record, storageId: 's2' }).remainingBytes();

    expect(plans.planFor).toHaveBeenCalledWith('project-1');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the usage read fails', async () => {
    query.mockRejectedValue(new Error('Access Denied'));

    await expect(service.forStorage(record).remainingBytes()).rejects.toThrow(
      OwoxStorageUsageUnavailableException
    );
  });

  it('reads the usage again after a failed read', async () => {
    query.mockRejectedValueOnce(new Error('Access Denied'));
    const budget = service.forStorage(record);

    await expect(budget.remainingBytes()).rejects.toThrow(OwoxStorageUsageUnavailableException);
    await expect(budget.remainingBytes()).resolves.toBe(10 * GIB);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
