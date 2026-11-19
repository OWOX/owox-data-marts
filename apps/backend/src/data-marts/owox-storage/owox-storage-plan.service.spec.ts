import { Logger } from '@nestjs/common';
import { InternalProjectBillingService } from '../services/project-billing/internal-project-billing.service';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { OwoxStoragePlanService } from './owox-storage-plan.service';

describe('OwoxStoragePlanService', () => {
  const billing = { getBalance: jest.fn() };
  const moduleRef = { get: jest.fn(() => billing) };
  let service: OwoxStoragePlanService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    billing.getBalance.mockResolvedValue({ subscriptionPlanType: ProjectPlanType.PAID });
    service = new OwoxStoragePlanService(moduleRef as never);
  });

  it('resolves billing lazily from the module', async () => {
    await expect(service.planFor('p1')).resolves.toBe(ProjectPlanType.PAID);
    expect(moduleRef.get).toHaveBeenCalledWith(InternalProjectBillingService);
  });

  it('caches the plan for 60 s per project', async () => {
    jest.useFakeTimers();
    try {
      await service.planFor('p1');
      await service.planFor('p2');
      jest.advanceTimersByTime(59_000);
      await service.planFor('p1');
      expect(billing.getBalance).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(2_000);
      await service.planFor('p1');
      expect(billing.getBalance).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns null when billing throws', async () => {
    billing.getBalance.mockRejectedValue(new Error('balance API down'));

    await expect(service.planFor('p1')).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
