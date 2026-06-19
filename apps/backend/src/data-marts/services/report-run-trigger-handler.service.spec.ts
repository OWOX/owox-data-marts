import { DataSource, EntityManager, Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ReportRunTriggerHandlerService } from './report-run-trigger-handler.service';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { RunReportService } from '../use-cases/run-report.service';
import { DataMartRunService } from './data-mart-run.service';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';

describe('ReportRunTriggerHandlerService', () => {
  const createService = () => {
    const triggerRepository = {
      save: jest.fn().mockImplementation(data => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as Repository<ReportRunTrigger>;

    const dataMartRunRepository = {
      save: jest.fn().mockImplementation(data => Promise.resolve(data)),
    } as unknown as Repository<DataMartRun>;

    const schedulerFacade = {
      registerTriggerHandler: jest.fn().mockResolvedValue(undefined),
    } as unknown as SchedulerFacade;

    const runReportService = {
      executeExistingRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as RunReportService;

    const dataMartRunService = {
      findById: jest.fn(),
    } as unknown as DataMartRunService;

    const configService = {
      get: jest.fn().mockReturnValue(1000),
    } as unknown as ConfigService;

    const mockManager = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((fn: (em: EntityManager) => Promise<unknown>) => fn(mockManager)),
    } as unknown as DataSource;

    const service = new ReportRunTriggerHandlerService(
      triggerRepository,
      dataMartRunRepository,
      schedulerFacade,
      runReportService,
      dataMartRunService,
      configService,
      dataSource
    );

    return {
      service,
      triggerRepository,
      runReportService,
      dataMartRunService,
      mockManager,
    };
  };

  const mockTrigger = {
    id: 'trigger-1',
    reportId: 'report-1',
    projectId: 'proj-1',
    dataMartRunId: 'run-1',
    createdById: 'user-1',
    status: TriggerStatus.PROCESSING,
    isActive: true,
  } as unknown as ReportRunTrigger;

  it('marks trigger cancelled and skips execution when run is already CANCELLED', async () => {
    const { service, dataMartRunService, triggerRepository, runReportService, mockManager } =
      createService();

    (mockManager.update as jest.Mock).mockResolvedValue({ affected: 0 });
    (dataMartRunService.findById as jest.Mock).mockResolvedValue({
      id: 'run-1',
      status: DataMartRunStatus.CANCELLED,
    });

    await expect(service.handleTrigger(mockTrigger)).resolves.toBeUndefined();

    expect(triggerRepository.update).toHaveBeenCalledWith(
      { id: 'trigger-1', status: In([TriggerStatus.PROCESSING, TriggerStatus.CANCELLING]) },
      { status: TriggerStatus.CANCELLED, isActive: false, version: expect.any(Function) }
    );
    expect(runReportService.executeExistingRun).not.toHaveBeenCalled();
  });

  it('marks trigger cancelled after execution is aborted by scheduler signal', async () => {
    const { service, triggerRepository, runReportService } = createService();
    const abortController = new AbortController();
    const trigger = Object.assign(new ReportRunTrigger(), mockTrigger);

    (runReportService.executeExistingRun as jest.Mock).mockImplementation(async () => {
      abortController.abort();
    });

    await service.handleTrigger(trigger, { signal: abortController.signal });

    expect(triggerRepository.update).toHaveBeenCalledWith(
      { id: 'trigger-1', status: In([TriggerStatus.PROCESSING, TriggerStatus.CANCELLING]) },
      { status: TriggerStatus.CANCELLED, isActive: false, version: expect.any(Function) }
    );
    trigger.onSuccess(new Date('2026-06-04T12:00:00.000Z'));
    expect(trigger.status).toBe(TriggerStatus.CANCELLED);
  });
});
