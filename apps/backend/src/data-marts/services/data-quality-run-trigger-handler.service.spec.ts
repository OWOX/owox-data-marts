import { DataSource, FindOptionsWhere, Repository, UpdateResult } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRunService } from './data-mart-run.service';
import {
  DataQualityResultPersistenceError,
  RunDataQualityService,
} from '../use-cases/run-data-quality.service';
import { DataQualityConsumptionPublicationError } from './data-quality-consumption.service';
import { DataQualityRunTriggerHandlerService } from './data-quality-run-trigger-handler.service';
import { DataQualityRunService } from './data-quality-run.service';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { createDataQualityLifecycleSummary } from './data-quality-run.service';
import { RunType } from '../../common/scheduler/shared/types';

describe('DataQualityRunTriggerHandlerService', () => {
  const create = () => {
    const orphanedRuns: DataMartRun[] = [];
    const queryBuilder = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn(async () => orphanedRuns),
    };
    [queryBuilder.leftJoin, queryBuilder.where, queryBuilder.andWhere].forEach(mock =>
      mock.mockReturnValue(queryBuilder)
    );
    queryBuilder.getMany.mockImplementation(async () => orphanedRuns);
    const trigger = Object.assign(new DataQualityRunTrigger(), {
      id: 'trigger-1',
      projectId: 'project-1',
      dataMartRunId: 'run-1',
      createdById: 'user-1',
      status: TriggerStatus.PROCESSING,
      isActive: true,
      version: 4,
      modifiedAt: new Date('2026-07-16T09:00:00.000Z'),
    });
    const persistedTrigger = Object.assign(new DataQualityRunTrigger(), { ...trigger });
    const triggerRepository = {
      save: jest.fn(async value => {
        Object.assign(persistedTrigger, value);
        return value;
      }),
      update: jest.fn(
        async (
          criteria: FindOptionsWhere<DataQualityRunTrigger>,
          partial: QueryDeepPartialEntity<DataQualityRunTrigger>
        ) => {
          const expected = criteria as Record<string, unknown>;
          const update = partial as Record<string, unknown>;
          if (
            expected.id === persistedTrigger.id &&
            typeof expected.status === 'string' &&
            typeof expected.version === 'number'
          ) {
            if (
              expected.status !== persistedTrigger.status ||
              expected.version !== persistedTrigger.version ||
              (typeof expected.isActive === 'boolean' &&
                expected.isActive !== persistedTrigger.isActive)
            ) {
              return { affected: 0 } as UpdateResult;
            }
            if (update.modifiedAt instanceof Date) {
              persistedTrigger.modifiedAt = update.modifiedAt;
            }
            if (typeof update.status === 'string') persistedTrigger.status = update.status;
            if (typeof update.isActive === 'boolean') persistedTrigger.isActive = update.isActive;
            if (typeof update.version === 'function' && update.version().includes('+ 1')) {
              persistedTrigger.version += 1;
            }
            return { affected: 1 } as UpdateResult;
          }
          return { affected: 1 } as UpdateResult;
        }
      ),
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
      terminalizeOrphanedRun: jest.fn(async (runId: string, error: string, finishedAt: Date) => {
        const run = orphanedRuns.find(candidate => candidate.id === runId);
        if (!run?.dataQualitySummary) return false;
        run.status = DataMartRunStatus.FAILED;
        run.finishedAt = finishedAt;
        run.errors = [error];
        run.dataQualitySummary = {
          ...run.dataQualitySummary,
          state: DataQualitySummaryState.EXECUTION_FAILED,
        };
        return true;
      }),
    } as unknown as jest.Mocked<DataQualityRunService>;
    const service = new DataQualityRunTriggerHandlerService(
      triggerRepository,
      dataMartRunRepository,
      scheduler,
      execution,
      dataMartRunService,
      qualityRunService
    );
    return {
      service,
      trigger,
      persistedTrigger,
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
    expect(triggerRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'trigger-1',
        status: TriggerStatus.PROCESSING,
        version: 4,
      }),
      expect.objectContaining({ status: TriggerStatus.IDLE, isActive: true })
    );
    trigger.onSuccess(new Date());
    expect(trigger.status).toBe(TriggerStatus.IDLE);
  });

  it('keeps a consumption publication failure retryable when cancellation arrives concurrently', async () => {
    const { service, trigger, execution, dataMartRunService } = create();
    const abortController = new AbortController();
    abortController.abort();
    execution.executeExistingRun.mockRejectedValue(
      new DataQualityConsumptionPublicationError(new Error('pubsub outcome unknown'))
    );

    await expect(
      service.handleTrigger(trigger, { signal: abortController.signal })
    ).resolves.toBeUndefined();

    expect(trigger).toMatchObject({ status: TriggerStatus.IDLE, isActive: true });
    expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
  });

  it('returns a result-persistence failure to IDLE without terminalizing the resumable run', async () => {
    const { service, trigger, triggerRepository, execution, qualityRunService } = create();
    execution.executeExistingRun.mockRejectedValue(
      new DataQualityResultPersistenceError(new Error('result storage unavailable'))
    );

    await expect(service.handleTrigger(trigger)).resolves.toBeUndefined();

    expect(trigger).toMatchObject({ status: TriggerStatus.IDLE, isActive: true });
    expect(triggerRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'trigger-1',
        status: TriggerStatus.PROCESSING,
        version: 4,
      }),
      expect.objectContaining({ status: TriggerStatus.IDLE, isActive: true })
    );
    expect(qualityRunService.markRunAndSummaryAsExecutionFailed).not.toHaveBeenCalled();
    trigger.onSuccess(new Date());
    expect(trigger.status).toBe(TriggerStatus.IDLE);
  });

  it('does not overwrite a recovered owner when result persistence fails after lease expiry', async () => {
    const { service, trigger, persistedTrigger, triggerRepository, execution } = create();
    let releaseFailure!: () => void;
    const failureReleased = new Promise<void>(resolve => {
      releaseFailure = resolve;
    });
    let executionStarted!: () => void;
    const started = new Promise<void>(resolve => {
      executionStarted = resolve;
    });
    execution.executeExistingRun.mockImplementation(async () => {
      executionStarted();
      await failureReleased;
      throw new DataQualityResultPersistenceError(new Error('result storage unavailable'));
    });

    const expiredWorker = service.handleTrigger(trigger);
    await started;
    persistedTrigger.status = TriggerStatus.PROCESSING;
    persistedTrigger.version += 3;
    persistedTrigger.modifiedAt = new Date('2026-07-16T10:00:00.000Z');
    releaseFailure();

    await expect(expiredWorker).rejects.toMatchObject({
      name: 'TriggerExecutionOwnershipError',
    });
    expect(triggerRepository.save).not.toHaveBeenCalled();
    expect(persistedTrigger).toMatchObject({
      status: TriggerStatus.PROCESSING,
      version: 7,
    });
  });

  it('fences an expired worker epoch and lets the recovered trigger resume the run', async () => {
    const { service, trigger, persistedTrigger, execution, qualityRunService } = create();
    let releaseExpiredWorker!: () => void;
    const expiredWorkerReleased = new Promise<void>(resolve => {
      releaseExpiredWorker = resolve;
    });
    let expiredWorkerStarted!: () => void;
    const workerStarted = new Promise<void>(resolve => {
      expiredWorkerStarted = resolve;
    });
    let attempt = 0;
    (execution.executeExistingRun as jest.Mock).mockImplementation(
      async (_runId, _projectId, _signal, ownership) => {
        await ownership.assertOwned();
        if (attempt++ === 0) {
          expiredWorkerStarted();
          await expiredWorkerReleased;
          await ownership.assertOwned();
        }
      }
    );

    const expiredWorker = service.handleTrigger(trigger);
    await workerStarted;

    // This is the persisted transition performed by generic stuck-trigger recovery, followed by
    // the next fetch/runner cycle. Every transition advances the execution epoch.
    persistedTrigger.status = TriggerStatus.IDLE;
    persistedTrigger.version += 1;
    persistedTrigger.modifiedAt = new Date('2026-07-16T08:00:00.000Z');
    persistedTrigger.status = TriggerStatus.PROCESSING;
    persistedTrigger.version += 2;
    persistedTrigger.modifiedAt = new Date('2026-07-16T10:00:00.000Z');
    const recoveredTrigger = Object.assign(new DataQualityRunTrigger(), {
      ...persistedTrigger,
    });

    releaseExpiredWorker();
    await expect(expiredWorker).rejects.toMatchObject({
      name: 'TriggerExecutionOwnershipError',
    });
    expect(qualityRunService.markRunAndSummaryAsExecutionFailed).not.toHaveBeenCalled();

    await expect(service.handleTrigger(recoveredTrigger)).resolves.toBeUndefined();
    expect(execution.executeExistingRun).toHaveBeenCalledTimes(2);
    expect(service.stuckTriggerTimeoutSeconds()).toBe(60 * 60);
  });

  it('heartbeats a live execution well before the stuck-trigger recovery timeout', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const { service, trigger, triggerRepository, execution } = create();
    let releaseExecution!: () => void;
    const executionReleased = new Promise<void>(resolve => {
      releaseExecution = resolve;
    });
    let executionStarted!: () => void;
    const started = new Promise<void>(resolve => {
      executionStarted = resolve;
    });
    execution.executeExistingRun.mockImplementation(async () => {
      executionStarted();
      await executionReleased;
    });

    const handling = service.handleTrigger(trigger);
    await started;
    const ownershipUpdatesBeforeHeartbeat = triggerRepository.update.mock.calls.filter(
      ([criteria]) => (criteria as { version?: number }).version === 4
    ).length;

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

    const ownershipUpdatesAfterHeartbeat = triggerRepository.update.mock.calls.filter(
      ([criteria]) => (criteria as { version?: number }).version === 4
    ).length;
    expect(ownershipUpdatesAfterHeartbeat).toBeGreaterThan(ownershipUpdatesBeforeHeartbeat);
    expect(5 * 60).toBeLessThan(service.stuckTriggerTimeoutSeconds());

    releaseExecution();
    await expect(handling).resolves.toBeUndefined();
  });

  it('preserves the execution epoch across real TypeORM heartbeat updates', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [DataQualityRunTrigger],
    });
    await dataSource.initialize();
    try {
      const repository = dataSource.getRepository(DataQualityRunTrigger);
      const trigger = await repository.save(
        repository.create({
          projectId: 'project-1',
          dataMartRunId: 'run-1',
          createdById: 'user-1',
          runType: RunType.manual,
          status: TriggerStatus.PROCESSING,
          isActive: true,
        })
      );
      const executionVersion = trigger.version;
      const execution = {
        executeExistingRun: jest.fn(async (_runId, _projectId, _signal, ownership) => {
          await ownership.assertOwned();
        }),
      } as unknown as jest.Mocked<RunDataQualityService>;
      const service = new DataQualityRunTriggerHandlerService(
        repository,
        {} as Repository<DataMartRun>,
        { registerTriggerHandler: jest.fn() } as unknown as SchedulerFacade,
        execution,
        {
          findById: jest.fn().mockResolvedValue({ id: 'run-1', status: DataMartRunStatus.RUNNING }),
        } as unknown as DataMartRunService,
        { markRunAndSummaryAsExecutionFailed: jest.fn() } as unknown as DataQualityRunService
      );

      await expect(service.handleTrigger(trigger)).resolves.toBeUndefined();

      const reloaded = await repository.findOneByOrFail({ id: trigger.id });
      expect(execution.executeExistingRun).toHaveBeenCalledTimes(1);
      expect(reloaded).toMatchObject({
        status: TriggerStatus.PROCESSING,
        version: executionVersion,
      });
    } finally {
      await dataSource.destroy();
    }
  });

  it('does not let stale cancellation cleanup cancel a recovered processing epoch', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [DataQualityRunTrigger],
    });
    await dataSource.initialize();
    try {
      const repository = dataSource.getRepository(DataQualityRunTrigger);
      const trigger = await repository.save(
        repository.create({
          projectId: 'project-1',
          dataMartRunId: 'run-1',
          createdById: 'user-1',
          runType: RunType.manual,
          status: TriggerStatus.PROCESSING,
          isActive: true,
        })
      );
      const abortController = new AbortController();
      const execution = {
        executeExistingRun: jest.fn(async () => {
          await repository.update(
            { id: trigger.id, status: TriggerStatus.PROCESSING, version: trigger.version },
            { version: () => 'version + 1' }
          );
          abortController.abort();
          abortController.signal.throwIfAborted();
        }),
      } as unknown as jest.Mocked<RunDataQualityService>;
      const run = { id: 'run-1', status: DataMartRunStatus.RUNNING, finishedAt: null };
      const service = new DataQualityRunTriggerHandlerService(
        repository,
        {} as Repository<DataMartRun>,
        { registerTriggerHandler: jest.fn() } as unknown as SchedulerFacade,
        execution,
        {
          findById: jest.fn().mockResolvedValue(run),
          markAsCancelled: jest.fn().mockResolvedValue(false),
        } as unknown as DataMartRunService,
        { markAsCancelled: jest.fn() } as unknown as DataQualityRunService
      );

      await expect(
        service.handleTrigger(trigger, { signal: abortController.signal })
      ).rejects.toMatchObject({ name: 'TriggerExecutionOwnershipError' });

      const reloaded = await repository.findOneByOrFail({ id: trigger.id });
      expect(reloaded).toMatchObject({
        status: TriggerStatus.PROCESSING,
        version: 2,
      });
    } finally {
      await dataSource.destroy();
    }
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

  it('completes an explicit CANCELLING epoch after execution returns with an abort signal', async () => {
    const { service, trigger, persistedTrigger, execution } = create();
    const abortController = new AbortController();
    execution.executeExistingRun.mockImplementation(async () => {
      persistedTrigger.status = TriggerStatus.CANCELLING;
      persistedTrigger.version = trigger.version + 1;
      abortController.abort();
    });

    await expect(
      service.handleTrigger(trigger, { signal: abortController.signal })
    ).resolves.toBeUndefined();

    expect(persistedTrigger).toMatchObject({
      status: TriggerStatus.CANCELLED,
      isActive: false,
      version: 6,
    });
    expect(trigger).toMatchObject({
      status: TriggerStatus.CANCELLED,
      isActive: false,
      version: 6,
    });
  });

  it('completes an explicit UI cancellation after a non-cancellable execution loses ownership', async () => {
    const { service, trigger, persistedTrigger, execution, dataMartRunService, qualityRunService } =
      create();
    const abortController = new AbortController();
    const run = {
      id: 'run-1',
      status: DataMartRunStatus.RUNNING,
      finishedAt: null,
    } as DataMartRun;
    dataMartRunService.findById.mockResolvedValue(run);
    let releaseExecution!: () => void;
    const executionReleased = new Promise<void>(resolve => {
      releaseExecution = resolve;
    });
    let executionStarted!: () => void;
    const started = new Promise<void>(resolve => {
      executionStarted = resolve;
    });
    execution.executeExistingRun.mockImplementation(
      async (_runId, _projectId, _signal, ownership) => {
        executionStarted();
        await executionReleased;
        await ownership.assertOwned();
      }
    );

    const handling = service.handleTrigger(trigger, { signal: abortController.signal });
    await started;

    run.status = DataMartRunStatus.CANCELLED;
    run.finishedAt = new Date('2026-07-16T10:00:00.000Z');
    persistedTrigger.status = TriggerStatus.CANCELLING;
    persistedTrigger.version = trigger.version + 1;
    abortController.abort();
    releaseExecution();

    await expect(handling).resolves.toBeUndefined();
    expect(run.status).toBe(DataMartRunStatus.CANCELLED);
    expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
    expect(qualityRunService.markAsCancelled).not.toHaveBeenCalled();
    expect(persistedTrigger).toMatchObject({
      status: TriggerStatus.CANCELLED,
      isActive: false,
      version: 6,
    });
    expect(trigger).toMatchObject({
      status: TriggerStatus.CANCELLED,
      isActive: false,
      version: 6,
    });
  });

  it('propagates ownership loss when cancellation was not requested', async () => {
    const { service, trigger, persistedTrigger, execution, dataMartRunService, qualityRunService } =
      create();
    execution.executeExistingRun.mockImplementation(
      async (_runId, _projectId, _signal, ownership) => {
        persistedTrigger.status = TriggerStatus.PROCESSING;
        persistedTrigger.version = trigger.version + 3;
        await ownership.assertOwned();
      }
    );

    await expect(service.handleTrigger(trigger)).rejects.toMatchObject({
      name: 'TriggerExecutionOwnershipError',
    });

    expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
    expect(qualityRunService.markAsCancelled).not.toHaveBeenCalled();
    expect(persistedTrigger).toMatchObject({
      status: TriggerStatus.PROCESSING,
      isActive: true,
      version: 7,
    });
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
      'project-1',
      error,
      new Date('2026-07-16T10:00:00.000Z'),
      expect.objectContaining({ assertOwned: expect.any(Function) })
    );
    expect(dataMartRunRepository.save).not.toHaveBeenCalled();
  });

  it('does not terminalize the parent run after a newer trigger epoch resumes execution', async () => {
    const { service, trigger, persistedTrigger, execution, qualityRunService } = create();
    const error = new Error('expired worker failed after recovery');
    execution.executeExistingRun.mockImplementation(async () => {
      persistedTrigger.status = TriggerStatus.PROCESSING;
      persistedTrigger.version += 3;
      persistedTrigger.modifiedAt = new Date('2026-07-16T10:00:00.000Z');
      throw error;
    });

    await expect(service.handleTrigger(trigger)).rejects.toMatchObject({
      name: 'TriggerExecutionOwnershipError',
    });

    expect(qualityRunService.markRunAndSummaryAsExecutionFailed).not.toHaveBeenCalled();
    expect(persistedTrigger).toMatchObject({
      status: TriggerStatus.PROCESSING,
      version: 7,
    });
  });

  it('returns the trigger to IDLE when atomic failure terminalization must be retried', async () => {
    const { service, trigger, triggerRepository, execution, qualityRunService } = create();
    execution.executeExistingRun.mockRejectedValue(new Error('snapshot could not be loaded'));
    qualityRunService.markRunAndSummaryAsExecutionFailed.mockRejectedValue(
      new Error('database unavailable')
    );

    await expect(service.handleTrigger(trigger)).resolves.toBeUndefined();

    expect(trigger).toMatchObject({ status: TriggerStatus.IDLE, isActive: true });
    expect(triggerRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'trigger-1',
        status: TriggerStatus.PROCESSING,
        version: 4,
      }),
      expect.objectContaining({ status: TriggerStatus.IDLE, isActive: true })
    );
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
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 2),
      dataQualityResults: [{ ruleKey: 'persisted-result' }],
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
      dataQualitySummary: expect.objectContaining({
        state: DataQualitySummaryState.EXECUTION_FAILED,
      }),
      dataQualityResults: [{ ruleKey: 'persisted-result' }],
    });
    expect(qualityRunService.terminalizeOrphanedRun).toHaveBeenCalledWith(
      'run-1',
      expect.stringContaining('trigger expired'),
      new Date('2026-07-16T10:00:00.000Z')
    );
    expect(dataMartRunRepository.save).not.toHaveBeenCalled();
    expect(qualityRunService.markAsExecutionFailed).not.toHaveBeenCalled();
  });

  it('retries orphan recovery when saving the single terminal aggregate fails', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const { service, dataMartRunRepository, qualityRunService, orphanedRuns } = create();
    const run = Object.assign(new DataMartRun(), {
      id: 'run-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      createdAt: new Date('2026-07-15T09:00:00.000Z'),
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 2),
      dataQualityResults: [{ ruleKey: 'persisted-result' }],
    });
    orphanedRuns.push(run);
    qualityRunService.terminalizeOrphanedRun.mockRejectedValueOnce(
      new Error('run repository unavailable')
    );

    await (service as unknown as { cleanupOrphanedRuns(): Promise<void> }).cleanupOrphanedRuns();

    expect(qualityRunService.terminalizeOrphanedRun).toHaveBeenCalledTimes(1);

    // The next query reloads the still-active database row after the failed cleanup attempt.
    Object.assign(run, {
      status: DataMartRunStatus.RUNNING,
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 2),
    });
    await (service as unknown as { cleanupOrphanedRuns(): Promise<void> }).cleanupOrphanedRuns();

    expect(qualityRunService.markAsExecutionFailed).not.toHaveBeenCalled();
    expect(qualityRunService.terminalizeOrphanedRun).toHaveBeenCalledTimes(2);
    expect(dataMartRunRepository.save).not.toHaveBeenCalled();
    expect(run.status).toBe(DataMartRunStatus.FAILED);
    expect(run.dataQualitySummary?.state).toBe(DataQualitySummaryState.EXECUTION_FAILED);
    expect(run.dataQualityResults).toEqual([{ ruleKey: 'persisted-result' }]);
  });
});
