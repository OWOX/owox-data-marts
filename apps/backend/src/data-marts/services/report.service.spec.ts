import { Repository } from 'typeorm';
import { ScheduledTriggerService } from './scheduled-trigger.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { Report } from '../entities/report.entity';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ReportService } from './report.service';

describe('ReportService', () => {
  const createService = () => {
    const repository = {
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<Report>;

    const scheduledTriggerService = {} as unknown as ScheduledTriggerService;
    const systemTimeService = {} as unknown as SystemTimeService;

    const service = new ReportService(repository, scheduledTriggerService, systemTimeService);

    return { service, repository };
  };

  it('marks report run state as cancelled without changing counters', async () => {
    const { service, repository } = createService();

    await service.markRunAsCancelled('report-1');

    expect(repository.update).toHaveBeenCalledWith('report-1', {
      lastRunStatus: ReportRunStatus.CANCELLED,
    });
  });
});
