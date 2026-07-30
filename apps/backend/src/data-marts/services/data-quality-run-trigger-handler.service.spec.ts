import { Repository } from 'typeorm';
import { SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMartRunService } from './data-mart-run.service';
import { RunDataQualityService } from '../use-cases/run-data-quality.service';
import { DataQualityRunTriggerHandlerService } from './data-quality-run-trigger-handler.service';
import { DataQualityRunService } from './data-quality-run.service';

describe('DataQualityRunTriggerHandlerService', () => {
  const create = () => {
    const trigger = Object.assign(new DataQualityRunTrigger(), {
      id: 'trigger-1',
      projectId: 'project-1',
      dataMartRunId: 'run-1',
      status: TriggerStatus.PROCESSING,
      isActive: true,
    });
    const triggerRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<DataQualityRunTrigger>>;
    const dataMartRunRepository = {
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<DataMartRun>>;
    const scheduler = { registerTriggerHandler: jest.fn() } as unknown as SchedulerFacade;
    const execution = {
      executeExistingRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RunDataQualityService>;
    const dataMartRunService = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'run-1', dataMartId: 'dm-1', status: DataMartRunStatus.RUNNING }),
      markAsCancelled: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<DataMartRunService>;
    const qualityRunService = {
      cancelActiveRun: jest.fn().mockResolvedValue(undefined),
      markRunAndSummaryAsExecutionFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DataQualityRunService>;
    const systemClock = {
      now: jest.fn().mockReturnValue(new Date('2026-07-29T12:05:00.000Z')),
    } as unknown as jest.Mocked<SystemTimeService>;
    const service = new (DataQualityRunTriggerHandlerService as unknown as new (
      ...args: unknown[]
    ) => DataQualityRunTriggerHandlerService)(
      triggerRepository,
      dataMartRunRepository,
      scheduler,
      execution,
      dataMartRunService,
      qualityRunService,
      systemClock
    );
    return {
      service,
      trigger,
      triggerRepository,
      dataMartRunRepository,
      execution,
      dataMartRunService,
      qualityRunService,
      systemClock,
    };
  };

  it('executes a processing trigger', async () => {
    const { service, trigger, execution } = create();

    await service.handleTrigger(trigger);

    expect(execution.executeExistingRun).toHaveBeenCalledWith('run-1', 'project-1', undefined);
  });

  it('refreshes a processing trigger heartbeat during a long Data Quality run', async () => {
    jest.useFakeTimers();
    try {
      const { service, trigger, triggerRepository, execution, systemClock } = create();
      let finishExecution: (() => void) | undefined;
      execution.executeExistingRun.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            finishExecution = resolve;
          })
      );

      const handling = service.handleTrigger(trigger);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(triggerRepository.update).toHaveBeenCalledWith(
        { id: 'trigger-1', status: TriggerStatus.PROCESSING },
        { modifiedAt: systemClock.now() }
      );

      finishExecution?.();
      await handling;
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels the run and trigger when execution is aborted', async () => {
    const {
      service,
      trigger,
      triggerRepository,
      execution,
      dataMartRunService,
      qualityRunService,
    } = create();
    const controller = new AbortController();
    controller.abort();
    execution.executeExistingRun.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await service.handleTrigger(trigger, { signal: controller.signal });

    expect(qualityRunService.cancelActiveRun).toHaveBeenCalledWith('run-1', 'dm-1');
    expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
    expect(trigger).toMatchObject({ status: TriggerStatus.CANCELLED, isActive: false });
    expect(triggerRepository.update).toHaveBeenCalled();
  });

  it('cancels the trigger when execution handles an abort before returning', async () => {
    const { service, trigger, triggerRepository, execution, dataMartRunService } = create();
    const controller = new AbortController();
    execution.executeExistingRun.mockImplementation(async () => {
      controller.abort();
    });
    dataMartRunService.findById
      .mockResolvedValueOnce({
        id: 'run-1',
        dataMartId: 'dm-1',
        status: DataMartRunStatus.RUNNING,
      } as DataMartRun)
      .mockResolvedValueOnce({
        id: 'run-1',
        dataMartId: 'dm-1',
        status: DataMartRunStatus.CANCELLED,
      } as DataMartRun);

    await service.handleTrigger(trigger, { signal: controller.signal });

    expect(trigger).toMatchObject({ status: TriggerStatus.CANCELLED, isActive: false });
    expect(triggerRepository.update).toHaveBeenCalled();
  });

  it('keeps the trigger successful when execution finishes before a late abort is observed', async () => {
    const { service, trigger, triggerRepository, execution, dataMartRunService } = create();
    const controller = new AbortController();
    execution.executeExistingRun.mockImplementation(async () => {
      controller.abort();
    });
    dataMartRunService.findById
      .mockResolvedValueOnce({
        id: 'run-1',
        dataMartId: 'dm-1',
        status: DataMartRunStatus.RUNNING,
      } as DataMartRun)
      .mockResolvedValueOnce({
        id: 'run-1',
        dataMartId: 'dm-1',
        status: DataMartRunStatus.SUCCESS,
      } as DataMartRun);

    await service.handleTrigger(trigger, { signal: controller.signal });

    expect(trigger).toMatchObject({ status: TriggerStatus.PROCESSING, isActive: true });
    expect(triggerRepository.update).not.toHaveBeenCalled();
  });

  it('terminalizes and propagates an unexpected execution failure', async () => {
    const { service, trigger, execution, qualityRunService } = create();
    const error = new Error('warehouse failed');
    execution.executeExistingRun.mockRejectedValue(error);

    await expect(service.handleTrigger(trigger)).rejects.toBe(error);

    expect(qualityRunService.markRunAndSummaryAsExecutionFailed).toHaveBeenCalledWith(
      'run-1',
      'project-1',
      error,
      expect.any(Date)
    );
  });

  it('terminalizes an orphaned pending Data Quality run with a matching summary state', async () => {
    const { service, dataMartRunRepository, qualityRunService } = create();
    const orphanedRun = {
      id: 'run-1',
      type: 'DATA_QUALITY',
      status: DataMartRunStatus.PENDING,
      errors: [],
      finishedAt: null,
      dataQualitySummary: {
        state: DataQualitySummaryState.QUEUED,
        enabledChecks: 1,
      },
    } as unknown as DataMartRun;
    const queryBuilder = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn(),
    };
    Object.values(queryBuilder).forEach(mock => mock.mockReturnValue(queryBuilder));
    queryBuilder.getMany.mockResolvedValue([orphanedRun]);
    dataMartRunRepository.createQueryBuilder.mockReturnValue(queryBuilder as never);
    dataMartRunRepository.save.mockResolvedValue(orphanedRun);

    await (service as unknown as { cleanupOrphanedRuns(): Promise<void> }).cleanupOrphanedRuns();

    expect(dataMartRunRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        errors: ['Data Quality run failed during execution'],
        finishedAt: expect.any(Date),
        dataQualitySummary: expect.objectContaining({
          state: DataQualitySummaryState.EXECUTION_FAILED,
        }),
      })
    );
    expect(qualityRunService.markRunAndSummaryAsExecutionFailed).not.toHaveBeenCalled();
  });

  it('propagates a terminalization failure', async () => {
    const { service, trigger, execution, qualityRunService } = create();
    const error = new Error('warehouse failed');
    execution.executeExistingRun.mockRejectedValue(error);
    const terminalizationError = new Error('database failed');
    qualityRunService.markRunAndSummaryAsExecutionFailed.mockRejectedValue(terminalizationError);

    await expect(service.handleTrigger(trigger)).rejects.toBe(terminalizationError);
  });
});
