import { DataSource, EntityManager, Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ReportRunTriggerHandlerService } from './report-run-trigger-handler.service';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { RunReportService } from '../use-cases/run-report.service';
import { DataMartRunService } from './data-mart-run.service';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

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
      findOneOrFail: jest.fn().mockResolvedValue({
        dataMart: { storage: { id: 's1', type: DataStorageType.GOOGLE_BIGQUERY } },
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

  describe('on a DuckDB storage', () => {
    const withCounts = (mockManager: EntityManager, counts: number[]) => {
      const getCount = jest.fn();
      counts.forEach(c => getCount.mockResolvedValueOnce(c));
      const where = jest.fn().mockReturnThis();
      const andWhere = jest.fn().mockReturnThis();
      (mockManager.createQueryBuilder as jest.Mock).mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where,
        andWhere,
        getCount,
      });
      return { getCount, where, andWhere };
    };
    const onStorage = (mockManager: EntityManager, type: DataStorageType) =>
      (mockManager.findOneOrFail as jest.Mock).mockResolvedValue({
        dataMart: { storage: { id: 's1', type } },
      });
    const loggerOf = (service: ReportRunTriggerHandlerService) =>
      (service as unknown as { logger: Logger }).logger;

    it('returns the trigger to IDLE while a load runs on the same storage', async () => {
      const { service, triggerRepository, runReportService, mockManager } = createService();
      const trigger = { ...mockTrigger } as ReportRunTrigger;
      onStorage(mockManager, DataStorageType.DUCKDB);
      const { where, andWhere } = withCounts(mockManager, [0, 1]);

      await service.handleTrigger(trigger);

      expect(mockManager.findOneOrFail).toHaveBeenCalledWith(DataMartRun, {
        where: { id: 'run-1' },
        relations: { dataMart: { storage: true } },
      });
      expect(where).toHaveBeenLastCalledWith('dm.storage = :storageId', { storageId: 's1' });
      expect(andWhere).toHaveBeenCalledWith('run.status = :status', {
        status: DataMartRunStatus.RUNNING,
      });
      expect(andWhere).toHaveBeenCalledWith('run.type IN (:...types)', {
        types: [DataMartRunType.CONNECTOR],
      });
      expect(trigger.status).toBe(TriggerStatus.IDLE);
      expect(trigger.isActive).toBe(true);
      expect(triggerRepository.save).toHaveBeenCalledWith(trigger);
      expect(runReportService.executeExistingRun).not.toHaveBeenCalled();
    });

    it('returns the trigger to IDLE while an older load waits for the storage', async () => {
      const { service, triggerRepository, runReportService, mockManager } = createService();
      const trigger = { ...mockTrigger } as ReportRunTrigger;
      onStorage(mockManager, DataStorageType.DUCKDB);
      withCounts(mockManager, [0, 0, 1]);

      await service.handleTrigger(trigger);

      expect(trigger.status).toBe(TriggerStatus.IDLE);
      expect(triggerRepository.save).toHaveBeenCalledWith(trigger);
      expect(runReportService.executeExistingRun).not.toHaveBeenCalled();
    });

    it('logs a storage hold at debug and a project limit at warn', async () => {
      const held = createService();
      onStorage(held.mockManager, DataStorageType.DUCKDB);
      withCounts(held.mockManager, [0, 1]);
      const heldDebug = jest.spyOn(loggerOf(held.service), 'debug').mockImplementation();
      const heldWarn = jest.spyOn(loggerOf(held.service), 'warn').mockImplementation();

      await held.service.handleTrigger({ ...mockTrigger } as ReportRunTrigger);

      expect(heldDebug).toHaveBeenCalledWith(
        'DuckDB storage s1 has a load in progress, trigger trigger-1 will retry'
      );
      expect(heldWarn).not.toHaveBeenCalled();

      const limited = createService();
      withCounts(limited.mockManager, [1000]);
      const limitedWarn = jest.spyOn(loggerOf(limited.service), 'warn').mockImplementation();

      await limited.service.handleTrigger({ ...mockTrigger } as ReportRunTrigger);

      expect(limitedWarn).toHaveBeenCalledWith(
        'Project proj-1 has reached the limit of 1000 concurrent report runs, trigger trigger-1 will retry'
      );
    });

    it('runs the report when no load runs on its storage or waits for it', async () => {
      const { service, runReportService, mockManager } = createService();
      onStorage(mockManager, DataStorageType.DUCKDB);
      const { getCount } = withCounts(mockManager, [0, 0, 0]);

      await service.handleTrigger({ ...mockTrigger } as ReportRunTrigger);

      expect(getCount).toHaveBeenCalledTimes(3);
      expect(runReportService.executeExistingRun).toHaveBeenCalled();
    });

    it('leaves a run whose Data Mart is gone to the report run, which reports it', async () => {
      const { service, runReportService, mockManager } = createService();
      (mockManager.findOneOrFail as jest.Mock).mockResolvedValue({ id: 'run-1' });
      withCounts(mockManager, [0]);

      await expect(
        service.handleTrigger({ ...mockTrigger } as ReportRunTrigger)
      ).resolves.toBeUndefined();

      expect(runReportService.executeExistingRun).toHaveBeenCalled();
    });

    it('does not look for loads on other storage types', async () => {
      const { service, runReportService, mockManager } = createService();
      onStorage(mockManager, DataStorageType.GOOGLE_BIGQUERY);
      const { getCount } = withCounts(mockManager, [0]);

      await service.handleTrigger({ ...mockTrigger } as ReportRunTrigger);

      expect(getCount).toHaveBeenCalledTimes(1);
      expect(runReportService.executeExistingRun).toHaveBeenCalled();
    });
  });
});
