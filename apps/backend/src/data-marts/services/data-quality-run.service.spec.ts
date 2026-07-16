import { DataSource, EntityManager, Repository } from 'typeorm';
import { RunType } from '../../common/scheduler/shared/types';
import { BigQueryFieldMode } from '../data-storage-types/bigquery/enums/bigquery-field-mode.enum';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { createAllDisabledDataQualityConfig } from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRunTriggerService } from './data-quality-run-trigger.service';
import { DataQualityConsumptionService } from './data-quality-consumption.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { TriggerExecutionOwnershipError } from '../../common/scheduler/shared/trigger-execution-ownership.error';
import {
  createDataQualityLifecycleSummary,
  DataQualityRunService,
} from './data-quality-run.service';

const outputSchema = {
  type: 'bigquery-data-mart-schema' as const,
  fields: [
    {
      name: 'id',
      type: BigQueryFieldType.INTEGER,
      mode: BigQueryFieldMode.REQUIRED,
      status: DataMartSchemaFieldStatus.CONNECTED,
      isPrimaryKey: true,
      isHiddenForReporting: false,
    },
  ],
};

function dataMart(overrides: Partial<DataMart> = {}): DataMart {
  return {
    id: 'dm-1',
    projectId: 'project-1',
    title: 'Orders',
    status: DataMartStatus.PUBLISHED,
    definitionType: DataMartDefinitionType.TABLE,
    definition: { fullyQualifiedName: 'project.dataset.orders' },
    schema: outputSchema,
    storage: {
      id: 'storage-1',
      projectId: 'project-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'project' },
    },
    dataQualityConfig: null,
    ...overrides,
  } as DataMart;
}

function relationship(source: DataMart): DataMartRelationship {
  return {
    id: 'rel-1',
    sourceDataMart: source,
    targetDataMart: { id: 'dm-2' },
    targetAlias: 'customers',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
  } as DataMartRelationship;
}

describe('DataQualityRunService.enqueue', () => {
  let source: DataMart;
  let repositories: Map<unknown, jest.Mocked<Repository<never>>>;
  let manager: jest.Mocked<EntityManager>;
  let dataSource: jest.Mocked<DataSource>;
  let triggerService: jest.Mocked<DataQualityRunTriggerService>;
  let consumptionService: jest.Mocked<DataQualityConsumptionService>;
  let systemClock: jest.Mocked<SystemTimeService>;
  let service: DataQualityRunService;

  const repository = () =>
    ({
      create: jest.fn(value => value),
      save: jest.fn(async value => {
        const record = value as Record<string, unknown>;
        record.id ??= `id-${Math.random()}`;
        return value;
      }),
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    }) as unknown as jest.Mocked<Repository<never>>;

  const mockLockedRun = (run: DataMartRun) => {
    const queryBuilder = {
      addSelect: jest.fn(),
      innerJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      setLock: jest.fn(),
      getOne: jest.fn().mockResolvedValue(run),
    };
    Object.values(queryBuilder).forEach(mock => mock.mockReturnValue(queryBuilder));
    queryBuilder.getOne.mockResolvedValue(run);
    repositories.get(DataMartRun)!.createQueryBuilder.mockReturnValue(queryBuilder as never);
    return queryBuilder;
  };

  beforeEach(() => {
    source = dataMart();
    repositories = new Map<unknown, jest.Mocked<Repository<never>>>([
      [DataMart, repository()],
      [DataMartRelationship, repository()],
      [DataMartRun, repository()],
    ]);
    repositories.get(DataMart)!.findOne.mockResolvedValue(source as never);
    repositories.get(DataMartRelationship)!.find.mockResolvedValue([relationship(source)] as never);
    repositories.get(DataMartRun)!.findOne.mockResolvedValue(null);
    manager = {
      getRepository: jest.fn(entity => repositories.get(entity)!),
    } as unknown as jest.Mocked<EntityManager>;
    dataSource = {
      options: { type: 'mysql' },
      transaction: jest.fn(async callback => callback(manager)),
    } as unknown as jest.Mocked<DataSource>;
    triggerService = {
      createTrigger: jest.fn().mockResolvedValue('trigger-1'),
      findForCancellation: jest.fn().mockResolvedValue(null),
      requestCancellation: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DataQualityRunTriggerService>;
    consumptionService = {
      settle: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DataQualityConsumptionService>;
    systemClock = {
      now: jest.fn().mockReturnValue(new Date('2026-07-16T10:00:00.000Z')),
    } as unknown as jest.Mocked<SystemTimeService>;
    service = new DataQualityRunService(
      dataSource,
      repositories.get(DataMart)! as never,
      repositories.get(DataMartRelationship)! as never,
      repositories.get(DataMartRun)! as never,
      triggerService,
      consumptionService,
      systemClock
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('atomically snapshots effective config, schema, definition, relationships and queues one trigger', async () => {
    const result = await service.enqueue({
      dataMartId: source.id,
      projectId: source.projectId,
      createdById: 'user-1',
      runType: RunType.manual,
      relationshipTargetAccess: new Map([['dm-2', false]]),
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    const savedRun = repositories.get(DataMartRun)!.save.mock.calls[0][0] as DataMartRun;
    expect(savedRun).toMatchObject({
      dataMartId: 'dm-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.PENDING,
      definitionRun: source.definition,
      createdById: 'user-1',
      runType: RunType.manual,
      dataQualitySnapshot: {
        config: expect.any(Object),
        schema: outputSchema,
        relationships: [
          expect.objectContaining({
            id: 'rel-1',
            sourceDataMartId: 'dm-1',
            targetDataMartId: 'dm-2',
            targetAccessible: false,
          }),
        ],
        definitionType: DataMartDefinitionType.TABLE,
        timezone: 'UTC',
      },
      dataQualitySummary: expect.objectContaining({
        state: DataQualitySummaryState.QUEUED,
        enabledChecks: expect.any(Number),
        totalChecks: 0,
      }),
      dataQualityResults: [],
      dataQualityConsumptionPublishedAt: null,
    });
    expect(repositories.get(DataMartRun)!.save).toHaveBeenCalledTimes(1);
    expect(triggerService.createTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ dataMartRunId: savedRun.id, projectId: 'project-1' }),
      manager
    );
    expect(result.dataMartRunId).toBe(savedRun.id);
  });

  it('uses creation-ordered UUIDs when database timestamps tie', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-15T10:00:00.000Z').getTime());

    await service.enqueue({
      dataMartId: source.id,
      projectId: source.projectId,
      createdById: 'user-1',
      runType: RunType.manual,
      relationshipTargetAccess: new Map(),
    });
    await service.enqueue({
      dataMartId: source.id,
      projectId: source.projectId,
      createdById: 'user-1',
      runType: RunType.manual,
      relationshipTargetAccess: new Map(),
    });

    const savedRuns = repositories
      .get(DataMartRun)!
      .save.mock.calls.map(call => call[0] as DataMartRun);
    expect(savedRuns).toHaveLength(2);
    expect(savedRuns[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(savedRuns[0].id < savedRuns[1].id).toBe(true);
  });

  it('uses the creation-ordered UUID as the latest-run timestamp tie-breaker', async () => {
    const runRepository = repositories.get(DataMartRun)!;
    runRepository.findOne.mockResolvedValue(null);

    await expect(service.getLatest('dm-1')).resolves.toBeNull();

    expect(runRepository.findOne).toHaveBeenCalledWith({
      where: { dataMartId: 'dm-1', type: DataMartRunType.DATA_QUALITY },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  });

  it('selects heavy Data Quality fields only for detail', async () => {
    const detail = { id: 'run-1' } as DataMartRun;
    const queryBuilder = {
      addSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getOne: jest.fn().mockResolvedValue(detail),
    };
    Object.values(queryBuilder).forEach(mock => mock.mockReturnValue(queryBuilder));
    queryBuilder.getOne.mockResolvedValue(detail);
    const runRepository = repositories.get(DataMartRun)!;
    runRepository.createQueryBuilder = jest.fn(() => queryBuilder as never);

    await expect(service.getDetail('dm-1', 'run-1')).resolves.toBe(detail);

    expect(runRepository.createQueryBuilder).toHaveBeenCalledWith('run');
    expect(queryBuilder.addSelect).toHaveBeenNthCalledWith(1, 'run.dataQualitySnapshot');
    expect(queryBuilder.addSelect).toHaveBeenNthCalledWith(2, 'run.dataQualityResults');
    expect(queryBuilder.addSelect).toHaveBeenNthCalledWith(
      3,
      'run.dataQualityConsumptionPublishedAt'
    );
    expect(queryBuilder.where).toHaveBeenCalledWith('run.id = :runId', { runId: 'run-1' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('run.dataMartId = :dataMartId', {
      dataMartId: 'dm-1',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('run.type = :type', {
      type: DataMartRunType.DATA_QUALITY,
    });
  });

  it('cancels a PENDING run without creating a consumption obligation', async () => {
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      dataMart: source,
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.PENDING,
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.QUEUED, 2),
      dataQualityResults: [],
    } as unknown as DataMartRun;
    mockLockedRun(run);

    await service.cancelActiveRun('run-1', 'dm-1');

    expect(consumptionService.settle).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      status: DataMartRunStatus.CANCELLED,
      dataQualitySummary: expect.objectContaining({ state: DataQualitySummaryState.CANCELLED }),
      finishedAt: new Date('2026-07-16T10:00:00.000Z'),
    });
    expect(triggerService.requestCancellation).toHaveBeenCalledWith(null, manager);
  });

  it('bills a crash-retry RUNNING run before saving cancellation and requesting trigger cancellation', async () => {
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      dataMart: source,
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      startedAt: new Date('2026-07-16T09:59:00.000Z'),
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 2),
      dataQualityResults: [],
    } as unknown as DataMartRun;
    const trigger = {
      id: 'trigger-1',
      dataMartRunId: run.id,
      status: TriggerStatus.PROCESSING,
      isActive: true,
      version: 4,
    } as never;
    mockLockedRun(run);
    triggerService.findForCancellation.mockResolvedValue(trigger);
    consumptionService.settle.mockImplementationOnce(async (_manager, currentRun) => {
      currentRun.dataQualityConsumptionPublishedAt = new Date('2026-07-16T10:00:00.000Z');
    });

    await service.cancelActiveRun('run-1', 'dm-1');

    expect(consumptionService.settle).toHaveBeenCalledWith(manager, run);
    expect(run.dataQualityConsumptionPublishedAt).toEqual(new Date('2026-07-16T10:00:00.000Z'));
    const settleOrder = consumptionService.settle.mock.invocationCallOrder[0];
    const saveOrder = repositories.get(DataMartRun)!.save.mock.invocationCallOrder[0];
    const triggerOrder = triggerService.requestCancellation.mock.invocationCallOrder[0];
    expect(settleOrder).toBeLessThan(saveOrder);
    expect(saveOrder).toBeLessThan(triggerOrder);
  });

  it('leaves a RUNNING run retryable when cancellation cannot publish consumption', async () => {
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      dataMart: source,
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      startedAt: new Date('2026-07-16T09:59:00.000Z'),
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 2),
      dataQualityResults: [],
    } as unknown as DataMartRun;
    mockLockedRun(run);
    consumptionService.settle.mockRejectedValue(new Error('pubsub unavailable'));

    await expect(service.cancelActiveRun('run-1', 'dm-1')).rejects.toThrow('pubsub unavailable');

    expect(run).toMatchObject({ status: DataMartRunStatus.RUNNING, finishedAt: null });
    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
    expect(triggerService.requestCancellation).not.toHaveBeenCalled();
  });

  it('settles a RUNNING orphan before terminalizing it and preserves retryability on failure', async () => {
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      dataMart: source,
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      startedAt: new Date('2026-07-15T09:00:00.000Z'),
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 2),
      dataQualityResults: [],
    } as unknown as DataMartRun;
    mockLockedRun(run);

    await expect(
      service.terminalizeOrphanedRun(
        run.id,
        'The Data Quality run trigger expired before the run could complete.',
        new Date('2026-07-16T10:00:00.000Z')
      )
    ).resolves.toBe(true);

    expect(consumptionService.settle).toHaveBeenCalledWith(manager, run);
    expect(run).toMatchObject({
      status: DataMartRunStatus.FAILED,
      errors: [expect.stringContaining('trigger expired')],
      dataQualitySummary: expect.objectContaining({
        state: DataQualitySummaryState.EXECUTION_FAILED,
      }),
    });

    jest.clearAllMocks();
    Object.assign(run, {
      status: DataMartRunStatus.RUNNING,
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 2),
    });
    mockLockedRun(run);
    consumptionService.settle.mockRejectedValue(new Error('pubsub unavailable'));

    await expect(
      service.terminalizeOrphanedRun(run.id, 'trigger expired', new Date())
    ).rejects.toThrow('pubsub unavailable');
    expect(run).toMatchObject({ status: DataMartRunStatus.RUNNING, finishedAt: null, errors: [] });
    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
  });

  it('marks the persisted Data Quality summary as execution failed during orphan cleanup', async () => {
    const runRepository = repositories.get(DataMartRun)!;
    const run = {
      id: 'run-1',
      type: DataMartRunType.DATA_QUALITY,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 3),
      dataQualityResults: [{ ruleKey: 'persisted-result' }],
      finishedAt: null,
    } as unknown as DataMartRun;
    const finishedAt = new Date('2026-07-16T10:00:00.000Z');
    runRepository.findOne.mockResolvedValue(run as never);

    await service.markAsExecutionFailed('run-1', finishedAt);

    expect(run.dataQualitySummary?.state).toBe(DataQualitySummaryState.EXECUTION_FAILED);
    expect(run.finishedAt).toEqual(finishedAt);
    expect(run.dataQualityResults).toEqual([{ ruleKey: 'persisted-result' }]);
    expect(runRepository.save).toHaveBeenCalledWith(run);
  });

  it('atomically terminalizes an active Data Mart run and its Data Quality summary', async () => {
    const run = {
      id: 'run-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      errors: [],
      finishedAt: null,
    } as unknown as DataMartRun;
    run.dataQualitySummary = createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 3);
    run.dataQualityResults = [{ ruleKey: 'persisted-result' }] as never;
    const error = new Error('snapshot could not be loaded');
    const finishedAt = new Date('2026-07-16T10:00:00.000Z');
    repositories.get(DataMartRun)!.findOne.mockResolvedValue(run as never);

    await service.markRunAndSummaryAsExecutionFailed('run-1', 'project-1', error, finishedAt);

    expect(run).toMatchObject({
      status: DataMartRunStatus.FAILED,
      errors: ['snapshot could not be loaded'],
      finishedAt,
      dataQualitySummary: expect.objectContaining({
        state: DataQualitySummaryState.EXECUTION_FAILED,
      }),
      dataQualityResults: [{ ruleKey: 'persisted-result' }],
    });
    expect(repositories.get(DataMartRun)!.save).toHaveBeenCalledWith(run);
    expect(repositories.get(DataMartRun)!.findOne).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        type: DataMartRunType.DATA_QUALITY,
        dataMart: { projectId: 'project-1' },
      },
      lock: { mode: 'pessimistic_write' },
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not terminalize a Data Quality run owned by another project', async () => {
    const run = {
      id: 'run-1',
      dataMart: dataMart({ projectId: 'project-2' }),
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 3),
    } as unknown as DataMartRun;
    repositories.get(DataMartRun)!.findOne.mockImplementation(async options => {
      const expectedProjectId = (
        options?.where as { dataMart?: { projectId?: string } } | undefined
      )?.dataMart?.projectId;
      return (
        !expectedProjectId || expectedProjectId === run.dataMart.projectId ? run : null
      ) as never;
    });

    await service.markRunAndSummaryAsExecutionFailed(
      'run-1',
      'project-1',
      new Error('malformed cross-project trigger'),
      new Date('2026-07-16T10:00:00.000Z')
    );

    expect(run).toMatchObject({
      status: DataMartRunStatus.RUNNING,
      errors: [],
      finishedAt: null,
      dataQualitySummary: expect.objectContaining({ state: DataQualitySummaryState.RUNNING }),
    });
    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
  });

  it('revalidates ownership inside unexpected terminalization before mutating the run', async () => {
    const run = {
      id: 'run-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 3),
    } as unknown as DataMartRun;
    const ownershipError = new TriggerExecutionOwnershipError('trigger-1', 4);
    repositories.get(DataMartRun)!.findOne.mockResolvedValue(run as never);

    await expect(
      service.markRunAndSummaryAsExecutionFailed(
        'run-1',
        'project-1',
        new Error('stale worker'),
        new Date('2026-07-16T10:00:00.000Z'),
        {
          assertOwned: jest.fn(async transactionManager => {
            if (transactionManager) throw ownershipError;
          }),
        }
      )
    ).rejects.toBe(ownershipError);

    expect(run.status).toBe(DataMartRunStatus.RUNNING);
    expect(run.finishedAt).toBeNull();
    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
  });

  it('saves an explicit replacement config and snapshots exactly its effective state', async () => {
    const replacement = createAllDisabledDataQualityConfig();

    await expect(
      service.enqueue({
        dataMartId: source.id,
        projectId: source.projectId,
        createdById: 'user-1',
        runType: RunType.manual,
        config: replacement,
        relationshipTargetAccess: new Map([['dm-2', true]]),
      })
    ).rejects.toThrow('at least one applicable enabled check');

    expect(repositories.get(DataMart)!.save).not.toHaveBeenCalled();
    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
  });

  it('returns a typed conflict with the active run id before creating another run', async () => {
    repositories.get(DataMartRun)!.findOne.mockResolvedValue({ id: 'active-run' } as never);

    await expect(
      service.enqueue({
        dataMartId: source.id,
        projectId: source.projectId,
        createdById: 'user-1',
        runType: RunType.manual,
        relationshipTargetAccess: new Map(),
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DATA_QUALITY_RUN_ACTIVE',
        activeRunId: 'active-run',
      }),
    });

    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
  });

  it.each([
    [dataMart({ status: DataMartStatus.DRAFT }), 'published'],
    [dataMart({ schema: undefined }), 'Output Schema'],
  ])(
    'rejects an ineligible Data Mart without creating or charging a run',
    async (ineligible, message) => {
      source = ineligible;
      repositories.get(DataMart)!.findOne.mockResolvedValue(source as never);

      await expect(
        service.enqueue({
          dataMartId: source.id,
          projectId: source.projectId,
          createdById: 'user-1',
          runType: RunType.manual,
          relationshipTargetAccess: new Map(),
        })
      ).rejects.toThrow(message);

      expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
      expect(triggerService.createTrigger).not.toHaveBeenCalled();
    }
  );

  it('exposes the deterministic active run id for config eligibility', async () => {
    const activeRepository = (service as any).dataMartRunRepository as jest.Mocked<
      Repository<DataMartRun>
    >;
    activeRepository.findOne.mockResolvedValue({ id: 'active-run' } as DataMartRun);

    await expect(service.getActiveRunId('dm-1')).resolves.toBe('active-run');
    expect(activeRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dataMartId: 'dm-1', type: DataMartRunType.DATA_QUALITY }),
        order: { createdAt: 'DESC', id: 'DESC' },
      })
    );
  });
});
