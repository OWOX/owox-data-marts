import { ConflictException } from '@nestjs/common';
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
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRun } from '../entities/data-quality-run.entity';
import { createAllDisabledDataQualityConfig } from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRunTriggerService } from './data-quality-run-trigger.service';
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
    }) as unknown as jest.Mocked<Repository<never>>;

  beforeEach(() => {
    source = dataMart();
    repositories = new Map([
      [DataMart, repository()],
      [DataMartRelationship, repository()],
      [DataMartRun, repository()],
      [DataQualityRun, repository()],
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
    } as unknown as jest.Mocked<DataQualityRunTriggerService>;
    service = new DataQualityRunService(
      dataSource,
      repository() as never,
      repository() as never,
      repository() as never,
      repository() as never,
      repository() as never,
      triggerService
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
    const savedDataMartRun = repositories.get(DataMartRun)!.save.mock.calls[0][0] as DataMartRun;
    expect(savedDataMartRun).toMatchObject({
      dataMartId: 'dm-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.PENDING,
      definitionRun: source.definition,
      createdById: 'user-1',
      runType: RunType.manual,
    });
    const savedQualityRun = repositories.get(DataQualityRun)!.save.mock
      .calls[0][0] as DataQualityRun;
    expect(savedQualityRun.schemaSnapshot).toEqual(outputSchema);
    expect(savedQualityRun.relationshipSnapshots).toEqual([
      expect.objectContaining({
        id: 'rel-1',
        sourceDataMartId: 'dm-1',
        targetDataMartId: 'dm-2',
        targetAccessible: false,
      }),
    ]);
    expect(savedQualityRun.summary).toMatchObject({
      state: DataQualitySummaryState.QUEUED,
      enabledChecks: expect.any(Number),
      totalChecks: 0,
    });
    expect(triggerService.createTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ dataMartRunId: savedDataMartRun.id, projectId: 'project-1' }),
      manager
    );
    expect(result.dataMartRunId).toBe(savedDataMartRun.id);
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

    const savedDataMartRuns = repositories
      .get(DataMartRun)!
      .save.mock.calls.map(call => call[0] as DataMartRun);
    const savedQualityRuns = repositories
      .get(DataQualityRun)!
      .save.mock.calls.map(call => call[0] as DataQualityRun);
    expect(savedDataMartRuns).toHaveLength(2);
    expect(savedQualityRuns).toHaveLength(2);
    expect(savedDataMartRuns[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(savedQualityRuns[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(savedDataMartRuns[0].id < savedDataMartRuns[1].id).toBe(true);
    expect(savedQualityRuns[0].id < savedQualityRuns[1].id).toBe(true);
  });

  it('uses the creation-ordered UUID as the latest-run timestamp tie-breaker', async () => {
    const qualityRunRepository = (
      service as unknown as {
        dataQualityRunRepository: jest.Mocked<Repository<DataQualityRun>>;
      }
    ).dataQualityRunRepository;
    qualityRunRepository.findOne.mockResolvedValue(null);

    await expect(service.getLatest('dm-1')).resolves.toBeNull();

    expect(qualityRunRepository.findOne).toHaveBeenCalledWith({
      where: {
        dataMartRun: { dataMartId: 'dm-1', type: DataMartRunType.DATA_QUALITY },
      },
      relations: { dataMartRun: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  });

  it('marks the persisted Data Quality summary as execution failed during orphan cleanup', async () => {
    const qualityRunRepository = (
      service as unknown as {
        dataQualityRunRepository: jest.Mocked<Repository<DataQualityRun>>;
      }
    ).dataQualityRunRepository;
    const qualityRun = {
      dataMartRunId: 'run-1',
      summary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 3),
      finishedAt: null,
    } as DataQualityRun;
    const finishedAt = new Date('2026-07-16T10:00:00.000Z');
    qualityRunRepository.findOne.mockResolvedValue(qualityRun);

    await service.markAsExecutionFailed('run-1', finishedAt);

    expect(qualityRun.summary.state).toBe(DataQualitySummaryState.EXECUTION_FAILED);
    expect(qualityRun.finishedAt).toEqual(finishedAt);
    expect(qualityRunRepository.save).toHaveBeenCalledWith(qualityRun);
  });

  it('atomically terminalizes an active Data Mart run and its Data Quality summary', async () => {
    const run = {
      id: 'run-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      errors: [],
      finishedAt: null,
    } as DataMartRun;
    const qualityRun = {
      dataMartRunId: 'run-1',
      summary: createDataQualityLifecycleSummary(DataQualitySummaryState.RUNNING, 3),
      finishedAt: null,
    } as DataQualityRun;
    const error = new Error('snapshot could not be loaded');
    const finishedAt = new Date('2026-07-16T10:00:00.000Z');
    repositories.get(DataMartRun)!.findOne.mockResolvedValue(run as never);
    repositories.get(DataQualityRun)!.findOne.mockResolvedValue(qualityRun as never);

    await service.markRunAndSummaryAsExecutionFailed('run-1', error, finishedAt);

    expect(qualityRun).toMatchObject({
      summary: expect.objectContaining({ state: DataQualitySummaryState.EXECUTION_FAILED }),
      finishedAt,
    });
    expect(run).toMatchObject({
      status: DataMartRunStatus.FAILED,
      errors: ['snapshot could not be loaded'],
      finishedAt,
    });
    expect(repositories.get(DataQualityRun)!.save).toHaveBeenCalledWith(qualityRun);
    expect(repositories.get(DataMartRun)!.save).toHaveBeenCalledWith(run);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
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
    ).rejects.toMatchObject<Partial<ConflictException>>({
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
