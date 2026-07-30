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
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRunTriggerService } from './data-quality-run-trigger.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
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
    targetDataMart: dataMart({
      id: 'dm-2',
      title: 'Customers',
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT id FROM saved_customers' },
      storage: source.storage,
    }),
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
  let systemClock: jest.Mocked<SystemTimeService>;
  let service: DataQualityRunService;

  const repository = () =>
    ({
      create: jest.fn(value => ({ ...value })),
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
    systemClock = {
      now: jest.fn().mockReturnValue(new Date('2026-07-16T10:00:00.000Z')),
    } as unknown as jest.Mocked<SystemTimeService>;
    service = new DataQualityRunService(
      dataSource,
      repositories.get(DataMart)! as never,
      repositories.get(DataMartRelationship)! as never,
      repositories.get(DataMartRun)! as never,
      triggerService,
      systemClock
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('snapshots the saved config without mutating it and queues one trigger atomically', async () => {
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
        sourceStorage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
        relationshipTargets: [],
      },
      dataQualitySummary: expect.objectContaining({
        state: DataQualitySummaryState.QUEUED,
        enabledChecks: expect.any(Number),
        totalChecks: 0,
      }),
      dataQualityResults: [],
    });
    expect(repositories.get(DataMartRun)!.save).toHaveBeenCalledTimes(1);
    expect(repositories.get(DataMart)!.save).not.toHaveBeenCalled();
    expect(repositories.get(DataMartRun)!.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ id: expect.anything() })
    );
    expect(triggerService.createTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ dataMartRunId: savedRun.id, projectId: 'project-1' }),
      manager
    );
    expect(result.dataMartRunId).toBe(savedRun.id);
  });

  it('queues a run when the expected config revision still matches the locked state', async () => {
    const { configRevision } = await service.getConfig(source.id, source.projectId);

    await expect(
      service.enqueue({
        dataMartId: source.id,
        projectId: source.projectId,
        createdById: 'user-1',
        runType: RunType.manual,
        relationshipTargetAccess: new Map([['dm-2', true]]),
        expectedConfigRevision: configRevision,
      })
    ).resolves.toEqual({ dataMartRunId: expect.any(String) });

    expect(repositories.get(DataMartRun)!.save).toHaveBeenCalledTimes(1);
    expect(triggerService.createTrigger).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale config revision before eligibility, run, or trigger creation', async () => {
    const { configRevision } = await service.getConfig(source.id, source.projectId);
    source.schema = {
      ...outputSchema,
      fields: [{ ...outputSchema.fields[0], type: BigQueryFieldType.STRING }],
    };

    await expect(
      service.enqueue({
        dataMartId: source.id,
        projectId: source.projectId,
        createdById: 'user-1',
        runType: RunType.manual,
        relationshipTargetAccess: new Map([['dm-2', true]]),
        expectedConfigRevision: configRevision,
      })
    ).rejects.toMatchObject({
      response: {
        code: 'DATA_QUALITY_CONFIG_REVISION_CONFLICT',
        message: 'Data Quality configuration changed before the run could be queued',
        expectedConfigRevision: configRevision,
        currentConfigRevision: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });

    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
    expect(triggerService.createTrigger).not.toHaveBeenCalled();
  });

  it('rejects a revision made stale by a concurrent saved-config replacement', async () => {
    const { configRevision } = await service.getConfig(source.id, source.projectId);
    source.dataQualityConfig = {
      rules: [
        {
          key: 'empty_table:data_mart',
          category: DataQualityCategory.EMPTY_TABLE,
          scope: { type: DataQualityScope.DATA_MART },
          severity: DataQualitySeverity.WARNING,
          enabled: true,
          parameters: {},
        },
      ],
    };

    await expect(
      service.enqueue({
        dataMartId: source.id,
        projectId: source.projectId,
        createdById: 'user-1',
        runType: RunType.manual,
        relationshipTargetAccess: new Map([['dm-2', true]]),
        expectedConfigRevision: configRevision,
      })
    ).rejects.toMatchObject({
      response: {
        code: 'DATA_QUALITY_CONFIG_REVISION_CONFLICT',
        message: 'Data Quality configuration changed before the run could be queued',
        expectedConfigRevision: configRevision,
        currentConfigRevision: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });

    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
    expect(triggerService.createTrigger).not.toHaveBeenCalled();
  });

  it('persists scheduled origin on both the Data Mart run and its execution trigger', async () => {
    await service.enqueue({
      dataMartId: source.id,
      projectId: source.projectId,
      createdById: 'user-1',
      runType: RunType.scheduled,
      relationshipTargetAccess: new Map([['dm-2', true]]),
    });

    const savedRun = repositories.get(DataMartRun)!.save.mock.calls[0][0] as DataMartRun;
    expect(savedRun.runType).toBe(RunType.scheduled);
    expect(savedRun.dataQualitySnapshot?.relationshipTargets).toEqual([
      {
        relationshipId: 'rel-1',
        targetDataMartId: 'dm-2',
        definition: { sqlQuery: 'SELECT id FROM saved_customers' },
        schema: outputSchema,
        storage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
      },
    ]);
    expect(triggerService.createTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        dataMartRunId: savedRun.id,
        runType: RunType.scheduled,
      }),
      manager
    );
  });

  it('stores only enabled checks and their relationship metadata in a new run snapshot', async () => {
    source.dataQualityConfig = {
      rules: [
        {
          key: 'empty_table:data_mart',
          category: DataQualityCategory.EMPTY_TABLE,
          scope: { type: DataQualityScope.DATA_MART },
          severity: DataQualitySeverity.ERROR,
          enabled: true,
          parameters: {},
        },
      ],
    };

    await service.enqueue({
      dataMartId: source.id,
      projectId: source.projectId,
      createdById: 'user-1',
      runType: RunType.manual,
      relationshipTargetAccess: new Map([['dm-2', true]]),
    });

    const savedRun = repositories.get(DataMartRun)!.save.mock.calls[0][0] as DataMartRun;
    expect(savedRun.dataQualitySnapshot?.config.rules).toEqual([
      expect.objectContaining({ key: 'empty_table:data_mart', enabled: true }),
    ]);
    expect(savedRun.dataQualitySnapshot?.relationships).toEqual([]);
    expect(savedRun.dataQualitySnapshot?.relationshipTargets).toEqual([]);
    expect(savedRun.dataQualitySummary?.enabledChecks).toBe(1);
  });

  it('omits target execution data for an enabled relationship check that is not applicable', async () => {
    source.dataQualityConfig = {
      rules: [
        {
          key: 'empty_table:data_mart',
          category: DataQualityCategory.EMPTY_TABLE,
          scope: { type: DataQualityScope.DATA_MART },
          severity: DataQualitySeverity.ERROR,
          enabled: true,
          parameters: {},
        },
        {
          key: 'relationship_integrity:relationship:rel-1',
          category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
          scope: { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-1' },
          severity: DataQualitySeverity.WARNING,
          enabled: true,
          parameters: {},
        },
      ],
    };
    const inapplicableRelationship = relationship(source);
    inapplicableRelationship.joinConditions = [
      { sourceFieldName: 'missing_source_field', targetFieldName: 'id' },
    ];
    repositories
      .get(DataMartRelationship)!
      .find.mockResolvedValue([inapplicableRelationship] as never);

    await service.enqueue({
      dataMartId: source.id,
      projectId: source.projectId,
      createdById: 'user-1',
      runType: RunType.manual,
      relationshipTargetAccess: new Map([['dm-2', true]]),
    });

    const savedRun = repositories.get(DataMartRun)!.save.mock.calls[0][0] as DataMartRun;
    expect(savedRun.dataQualitySnapshot?.config.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'relationship_integrity:relationship:rel-1',
          enabled: true,
          isApplicable: false,
        }),
      ])
    );
    expect(savedRun.dataQualitySnapshot?.relationships).toEqual([
      expect.objectContaining({ id: 'rel-1', targetAccessible: true }),
    ]);
    expect(savedRun.dataQualitySnapshot?.relationshipTargets).toEqual([]);
  });

  it('uses the run id as the deterministic latest-run timestamp tie-breaker', async () => {
    const runRepository = repositories.get(DataMartRun)!;
    runRepository.findOne.mockResolvedValue(null);

    await expect(service.getLatest('dm-1')).resolves.toBeNull();

    expect(runRepository.findOne).toHaveBeenCalledWith({
      where: { dataMartId: 'dm-1', type: DataMartRunType.DATA_QUALITY },
      order: { createdAt: 'DESC', id: 'DESC' },
      select: {
        id: true,
        dataQualitySummary: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });
  });

  it('cancels a PENDING run and sanitizes its generic error', async () => {
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      dataMart: source,
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.PENDING,
      errors: [],
      finishedAt: null,
      dataQualitySummary: createDataQualityLifecycleSummary(DataQualitySummaryState.QUEUED, 2),
      dataQualityResults: [
        {
          status: DataQualityCheckStatus.ERROR,
          error: { message: 'SELECT secret FROM private_table' },
        },
      ],
    } as unknown as DataMartRun;
    mockLockedRun(run);

    await service.cancelActiveRun('run-1', 'dm-1');

    expect(run).toMatchObject({
      status: DataMartRunStatus.CANCELLED,
      dataQualitySummary: expect.objectContaining({ state: DataQualitySummaryState.CANCELLED }),
      finishedAt: new Date('2026-07-16T10:00:00.000Z'),
      errors: ['Data Quality run failed during execution'],
    });
    expect(JSON.stringify(run.errors)).not.toContain('private_table');
    expect(triggerService.requestCancellation).toHaveBeenCalledWith(null, manager);
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
    const error = new Error('SELECT credential FROM private_schema.secret_table');
    const finishedAt = new Date('2026-07-16T10:00:00.000Z');
    repositories.get(DataMartRun)!.findOne.mockResolvedValue(run as never);

    await service.markRunAndSummaryAsExecutionFailed('run-1', 'project-1', error, finishedAt);

    expect(run).toMatchObject({
      status: DataMartRunStatus.FAILED,
      errors: ['Data Quality run failed during execution'],
      finishedAt,
      dataQualitySummary: expect.objectContaining({
        state: DataQualitySummaryState.EXECUTION_FAILED,
      }),
      dataQualityResults: [{ ruleKey: 'persisted-result' }],
    });
    expect(repositories.get(DataMartRun)!.save).toHaveBeenCalledWith(run);
    expect(JSON.stringify(run.errors)).not.toContain('private_schema');
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
        select: { id: true },
      })
    );
  });
});
