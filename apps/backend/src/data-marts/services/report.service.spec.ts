import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ScheduledTriggerService } from './scheduled-trigger.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { Report } from '../entities/report.entity';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ReportService } from './report.service';

describe('ReportService', () => {
  const createService = () => {
    const repository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const scheduledTriggerService = {} as unknown as ScheduledTriggerService;
    const systemTimeService = {} as unknown as SystemTimeService;

    const service = new ReportService(
      repository as unknown as Repository<Report>,
      scheduledTriggerService,
      systemTimeService
    );

    return { service, repository };
  };

  it('marks report run state as cancelled without changing counters', async () => {
    const { service, repository } = createService();

    await service.markRunAsCancelled('report-1');

    expect(repository.update).toHaveBeenCalledWith(
      { id: 'report-1', lastRunStatus: ReportRunStatus.RUNNING },
      {
        lastRunStatus: ReportRunStatus.CANCELLED,
      }
    );
  });

  it('persists the final run outcome as a targeted update, never a full entity save', async () => {
    // A full save would cascade the run-start DataMart snapshot over columns written during
    // the run (e.g. dataLastUpdated) — the outcome must touch only the Report's own scalars.
    const { service, repository } = createService();
    const report = {
      id: 'report-1',
      lastRunStatus: ReportRunStatus.ERROR,
      lastRunError: 'boom',
    } as Report;

    await service.updateLastRunOutcome(report);

    expect(repository.update).toHaveBeenCalledWith('report-1', {
      lastRunStatus: ReportRunStatus.ERROR,
      lastRunError: 'boom',
    });
  });

  it('clears lastRunError with an explicit NULL on a successful outcome', async () => {
    const { service, repository } = createService();
    const report = {
      id: 'report-1',
      lastRunStatus: ReportRunStatus.SUCCESS,
      lastRunError: undefined,
    } as Report;

    await service.updateLastRunOutcome(report);

    const [id, patch] = repository.update.mock.calls[0] as [
      string,
      { lastRunStatus: ReportRunStatus; lastRunError: () => string },
    ];
    expect(id).toBe('report-1');
    expect(patch.lastRunStatus).toBe(ReportRunStatus.SUCCESS);
    // `update` silently skips undefined values, so the clear must be an explicit NULL.
    expect(patch.lastRunError()).toBe('NULL');
  });

  it('loads report by id scoped to project with data mart relation', async () => {
    const { service, repository } = createService();
    const report = {
      id: 'report-1',
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    } as Report;
    repository.findOne.mockResolvedValueOnce(report);

    await expect(service.getByIdAndProjectId('report-1', 'project-1')).resolves.toBe(report);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'report-1', dataMart: { projectId: 'project-1' } },
      relations: ['dataMart'],
    });
  });

  it('throws NotFoundException when report is missing from the project', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValueOnce(null);

    await expect(service.getByIdAndProjectId('missing-report', 'project-1')).rejects.toThrow(
      NotFoundException
    );
  });
});
