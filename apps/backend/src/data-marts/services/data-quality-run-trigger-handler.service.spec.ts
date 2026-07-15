import { Repository } from 'typeorm';
import { SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRunService } from './data-mart-run.service';
import {
  DataQualityConsumptionPublicationError,
  RunDataQualityService,
} from '../use-cases/run-data-quality.service';
import { DataQualityRunTriggerHandlerService } from './data-quality-run-trigger-handler.service';
import { DataQualityRunService } from './data-quality-run.service';

describe('DataQualityRunTriggerHandlerService', () => {
  const create = () => {
    const orphanedRuns: DataMartRun[] = [];
    const queryBuilder = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn(async () => orphanedRuns),
    };
    Object.values(queryBuilder).forEach(mock => mock.mockReturnValue(queryBuilder));
    queryBuilder.getMany.mockImplementation(async () => orphanedRuns);
    const triggerRepository = {
      save: jest.fn(async value => value),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<DataQualityRunTrigger>>;
    const dataMartRunRepository = {
      save: jest.fn(async value => value),
      createQueryBuilder: jest.fn(() => queryBuilder),
    } as unknown as Repository<DataMartRun>;
    const scheduler = {
      registerTriggerHandler: jest.fn().mockResolvedValue(undefined),
    } as unknown as SchedulerFacade;
    const execution = {
      executeExistingRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RunDataQualityService>;
    const dataMartRunService = {
      findById: jest.fn().mockResolvedValue({ id: 'run-1', status: DataMartRunStatus.RUNNING }),
      markAsCancelled: jest.fn().mockImplementation(async run => {
        run.status = DataMartRunStatus.CANCELLED;
        run.finishedAt = new Date('2026-07-15T10:00:00.000Z');
        return true;
      }),
    } as unknown as jest.Mocked<DataMartRunService>;
    const qualityRunService = {
      markAsCancelled: jest.fn().mockResolvedValue(undefined),
      markAsExecutionFailed: jest.fn().mockResolvedValue(undefined),
      markRunAndSummaryAsExecutionFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DataQualityRunService>;
    const service = new DataQualityRunTriggerHandlerService(
      triggerRepository,
      dataMartRunRepository,
      scheduler,
      execution,
      dataMartRunService,
      qualityRunService
    );
    const trigger = Object.assign(new DataQualityRunTrigger(), {
      id: 'trigger-1',
      projectId: 'project-1',
      dataMartRunId: 'run-1',
      createdById: 'user-1',
      status: TriggerStatus.PROCESSING,
      isActive: true,
    });
    return {
      service,
      trigger,
      triggerRepository,
      execution,
      dataMartRunService,
      qualityRunService,
      dataMartRunRepository,
      orphanedRuns,
      queryBuilder,
    };
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a pre-SQL consumption failure to IDLE and onSuccess preserves the retry state', async () => {
    const { service, trigger, triggerRepository, execution } = create();
    execution.executeExistingRun.mockRejectedValue(
      new DataQualityConsumptionPublicationError(new Error('pubsub unavailable'))
    );

    await expect(service.handleTrigger(trigger)).resolves.toBeUndefined();

    expect(trigger.status).toBe(TriggerStatus.IDLE);
    expect(trigger.isActive).toBe(true);
    expect(triggerRepository.save).toHaveBeenCalledWith(trigger);
    trigger.onSuccess(new Date());
    expect(trigger.status).toBe(TriggerStatus.IDLE);
  });

  it('marks an aborted execution trigger as cancelled and preserves it through onSuccess', async () => {
    const { service, trigger, triggerRepository, execution } = create();
    const abortController = new AbortController();
    execution.executeExistingRun.mockImplementation(async () => abortController.abort());

    await service.handleTrigger(trigger, { signal: abortController.signal });

    expect(triggerRepository.update).toHaveBeenCalled();
    trigger.onSuccess(new Date());
    expect(trigger.status).toBe(TriggerStatus.CANCELLED);
  });

  it('cancels run state without claiming or billing when the signal is already aborted', async () => {
    const { service, trigger, execution, dataMartRunService, qualityRunService } = create();
    const abortController = new AbortController();
    abortController.abort();
    const run = { id: 'run-1', status: DataMartRunStatus.PENDING, finishedAt: null };
    dataMartRunService.findById.mockResolvedValue(run as DataMartRun);
    execution.executeExistingRun.mockRejectedValue(abortController.signal.reason);

    await service.handleTrigger(trigger, { signal: abortController.signal });

    expect(dataMartRunService.markAsCancelled).toHaveBeenCalledWith(run);
    expect(qualityRunService.markAsCancelled).toHaveBeenCalledWith(
      'run-1',
      new Date('2026-07-15T10:00:00.000Z')
    );
    expect(trigger.status).toBe(TriggerStatus.CANCELLED);
  });

  it('atomically terminalizes the run and summary after an unexpected handler failure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const { service, trigger, execution, dataMartRunRepository, qualityRunService } = create();
    const error = new Error('snapshot could not be loaded');
    execution.executeExistingRun.mockRejectedValue(error);

    await expect(service.handleTrigger(trigger)).rejects.toBe(error);

    expect(qualityRunService.markRunAndSummaryAsExecutionFailed).toHaveBeenCalledWith(
      'run-1',
      error,
      new Date('2026-07-16T10:00:00.000Z')
    );
    expect(dataMartRunRepository.save).not.toHaveBeenCalled();
  });

  it('returns the trigger to IDLE when atomic failure terminalization must be retried', async () => {
    const { service, trigger, triggerRepository, execution, qualityRunService } = create();
    execution.executeExistingRun.mockRejectedValue(new Error('snapshot could not be loaded'));
    qualityRunService.markRunAndSummaryAsExecutionFailed.mockRejectedValue(
      new Error('database unavailable')
    );

    await expect(service.handleTrigger(trigger)).resolves.toBeUndefined();

    expect(trigger).toMatchObject({ status: TriggerStatus.IDLE, isActive: true });
    expect(triggerRepository.save).toHaveBeenCalledWith(trigger);
  });

  it('terminalizes an orphaned RUNNING run after its retry trigger expires', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const { service, dataMartRunRepository, qualityRunService, orphanedRuns, queryBuilder } =
      create();
    const run = Object.assign(new DataMartRun(), {
      id: 'run-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      createdAt: new Date('2026-07-15T09:00:00.000Z'),
      errors: [],
      finishedAt: null,
    });
    orphanedRuns.push(run);

    await (service as unknown as { cleanupOrphanedRuns(): Promise<void> }).cleanupOrphanedRuns();

    expect(queryBuilder.where).toHaveBeenCalledWith('run.status IN (:...statuses)', {
      statuses: [DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING],
    });
    expect(run).toMatchObject({
      status: DataMartRunStatus.FAILED,
      finishedAt: new Date('2026-07-16T10:00:00.000Z'),
      errors: [expect.stringContaining('trigger expired')],
    });
    expect(dataMartRunRepository.save).toHaveBeenCalledWith(run);
    expect(
      (qualityRunService as unknown as { markAsExecutionFailed: jest.Mock }).markAsExecutionFailed
    ).toHaveBeenCalledWith('run-1', new Date('2026-07-16T10:00:00.000Z'));
  });

  it('keeps an orphaned run retryable until its Data Quality summary is terminal', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const { service, dataMartRunRepository, qualityRunService, orphanedRuns } = create();
    const run = Object.assign(new DataMartRun(), {
      id: 'run-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      createdAt: new Date('2026-07-15T09:00:00.000Z'),
      errors: [],
      finishedAt: null,
    });
    orphanedRuns.push(run);
    qualityRunService.markAsExecutionFailed.mockRejectedValueOnce(
      new Error('summary repository unavailable')
    );

    await (service as unknown as { cleanupOrphanedRuns(): Promise<void> }).cleanupOrphanedRuns();

    expect(dataMartRunRepository.save).not.toHaveBeenCalled();

    // The next query reloads the still-active database row after the failed cleanup attempt.
    Object.assign(run, {
      status: DataMartRunStatus.RUNNING,
      errors: [],
      finishedAt: null,
    });
    await (service as unknown as { cleanupOrphanedRuns(): Promise<void> }).cleanupOrphanedRuns();

    expect(qualityRunService.markAsExecutionFailed).toHaveBeenCalledTimes(2);
    expect(dataMartRunRepository.save).toHaveBeenCalledTimes(1);
    expect(run.status).toBe(DataMartRunStatus.FAILED);
  });
});
