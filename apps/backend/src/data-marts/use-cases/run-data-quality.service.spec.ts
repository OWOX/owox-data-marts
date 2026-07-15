import { DataSource, EntityManager, Repository } from 'typeorm';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import {
  DataQualityCheckCompiler,
  DataQualityCompiledCheck,
  DataQualityQueryPurpose,
} from '../data-quality/data-quality-check-compiler';
import { DataQualityQueryExecutorService } from '../data-quality/data-quality-query-executor.service';
import {
  DataQualityParsedResult,
  DataQualityResultParser,
} from '../data-quality/data-quality-result-parser';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityCheckResult } from '../entities/data-quality-check-result.entity';
import { DataQualityRun } from '../entities/data-quality-run.entity';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import { RunDataQualityService } from './run-data-quality.service';

const rule = (key: string) => ({
  key,
  category: DataQualityCategory.EMPTY_TABLE,
  scope: { type: DataQualityScope.DATA_MART as const },
  severity: DataQualitySeverity.ERROR,
  enabled: true,
  isApplicable: true,
  parameters: {},
});

const plan = (key: string): DataQualityCompiledCheck => ({
  kind: 'EXECUTABLE',
  category: DataQualityCategory.EMPTY_TABLE,
  ruleKey: key,
  severity: DataQualitySeverity.ERROR,
  strategy: 'COUNT',
  queries: [],
  reproductionSql: 'SELECT violations',
});

const parsed = (key: string, status = DataQualityCheckStatus.PASSED): DataQualityParsedResult => ({
  category: DataQualityCategory.EMPTY_TABLE,
  ruleKey: key,
  severity: DataQualitySeverity.ERROR,
  status,
  violationCount: status === DataQualityCheckStatus.FAILED ? 1 : 0,
  description: status === DataQualityCheckStatus.FAILED ? 'issue' : 'passed',
  examples: [],
  executedSql: ['SELECT check'],
  reproductionSql: 'SELECT violations',
  error:
    status === DataQualityCheckStatus.ERROR
      ? { code: 'WAREHOUSE_ERROR', message: 'warehouse failed', details: null }
      : null,
});

describe('RunDataQualityService', () => {
  let dataMart: DataMart;
  let dataMartRun: DataMartRun;
  let qualityRun: DataQualityRun;
  let repositories: Map<unknown, jest.Mocked<Repository<never>>>;
  let manager: jest.Mocked<EntityManager>;
  let dataSource: jest.Mocked<DataSource>;
  let compiler: jest.Mocked<DataQualityCheckCompiler>;
  let executor: jest.Mocked<DataQualityQueryExecutorService>;
  let parser: jest.Mocked<DataQualityResultParser>;
  let consumption: jest.Mocked<ConsumptionTrackingService>;
  let queryBuilder: jest.Mocked<DataMartQueryBuilderFacade>;
  let service: RunDataQualityService;
  const startedAt = new Date('2026-07-15T10:00:00.000Z');
  const finishedAt = new Date('2026-07-15T10:00:10.000Z');

  const repository = () =>
    ({
      create: jest.fn(value => value),
      save: jest.fn(async value => value),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    }) as unknown as jest.Mocked<Repository<never>>;

  beforeEach(() => {
    dataMart = {
      id: 'dm-1',
      projectId: 'project-1',
      definition: { fullyQualifiedName: 'project.dataset.table' },
      storage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
        config: { projectId: 'project' },
      },
    } as DataMart;
    dataMartRun = {
      id: 'run-1',
      dataMartId: 'dm-1',
      dataMart,
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.PENDING,
      runType: RunType.manual,
      definitionRun: dataMart.definition!,
      logs: [],
      errors: [],
      startedAt: null,
      finishedAt: null,
    } as DataMartRun;
    qualityRun = {
      id: 'quality-run-1',
      dataMartRunId: 'run-1',
      configSnapshot: { timezone: 'UTC', rules: [rule('empty-1')] },
      schemaSnapshot: null,
      relationshipSnapshots: [],
      timezone: 'UTC',
      summary: {
        state: DataQualitySummaryState.QUEUED,
        enabledChecks: 1,
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        notApplicableChecks: 0,
        errorChecks: 0,
        noticeFindings: 0,
        warningFindings: 0,
        errorFindings: 0,
        violationCount: 0,
        highestSeverity: null,
      },
      startedAt: null,
      finishedAt: null,
      consumptionPublishedAt: null,
    } as DataQualityRun;
    repositories = new Map([
      [DataMartRun, repository()],
      [DataQualityRun, repository()],
      [DataQualityCheckResult, repository()],
      [DataMart, repository()],
    ]);
    repositories.get(DataMartRun)!.findOne.mockResolvedValue(dataMartRun as never);
    repositories.get(DataQualityRun)!.findOne.mockResolvedValue(qualityRun as never);
    repositories.get(DataQualityCheckResult)!.find.mockResolvedValue([]);
    repositories.get(DataMart)!.find.mockResolvedValue([]);
    manager = {
      getRepository: jest.fn(entity => repositories.get(entity)!),
    } as unknown as jest.Mocked<EntityManager>;
    dataSource = {
      transaction: jest.fn(async callback => callback(manager)),
    } as unknown as jest.Mocked<DataSource>;
    compiler = { compile: jest.fn().mockResolvedValue(plan('empty-1')) } as never;
    executor = {
      executeChecks: jest.fn().mockImplementation(async function* (
        _dataMart: DataMart,
        checks: DataQualityCompiledCheck[]
      ) {
        for (const check of checks) yield { check, executions: [] };
      }),
    } as never;
    parser = { parse: jest.fn().mockResolvedValue(parsed('empty-1')) } as never;
    consumption = {
      registerDataQualityRunConsumption: jest.fn().mockResolvedValue('PUBLISHED'),
    } as never;
    queryBuilder = { buildQuery: jest.fn().mockResolvedValue('SELECT * FROM source') } as never;
    const clock = {
      now: jest.fn().mockReturnValueOnce(startedAt).mockReturnValue(finishedAt),
    } as unknown as SystemTimeService;
    service = new RunDataQualityService(
      dataSource,
      repositories.get(DataMartRun)! as never,
      repositories.get(DataQualityRun)! as never,
      repositories.get(DataQualityCheckResult)! as never,
      repositories.get(DataMart)! as never,
      queryBuilder,
      compiler,
      executor,
      parser,
      consumption,
      clock
    );
  });

  it('claims RUNNING durably, publishes once, persists each result, and finishes findings as SUCCESS/ISSUES', async () => {
    parser.parse.mockResolvedValue(parsed('empty-1', DataQualityCheckStatus.FAILED));

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
    expect(dataMartRun.startedAt).toEqual(startedAt);
    expect(qualityRun.startedAt).toEqual(startedAt);
    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledWith(
      dataMart,
      'run-1',
      startedAt
    );
    expect(repositories.get(DataQualityCheckResult)!.save).toHaveBeenCalledTimes(1);
    expect(qualityRun.summary).toMatchObject({
      state: DataQualitySummaryState.ISSUES,
      enabledChecks: 1,
      failedChecks: 1,
    });
    expect(qualityRun.consumptionPublishedAt).toEqual(finishedAt);
  });

  it('requests examples only when the preliminary measurement is a finding', async () => {
    await service.executeExistingRun('run-1', 'project-1');

    const options = executor.executeChecks.mock.calls[0][2];
    const examplesQuery = {
      purpose: DataQualityQueryPurpose.EXAMPLES,
      sql: 'SELECT examples',
    };
    const executions = [
      {
        purpose: DataQualityQueryPurpose.MEASUREMENT,
        sql: 'SELECT measurement',
        rows: [{ violation_count: 0 }],
      },
    ];
    parser.parse.mockResolvedValueOnce(parsed('empty-1', DataQualityCheckStatus.PASSED));
    await expect(
      options.shouldExecuteQuery?.(plan('empty-1'), examplesQuery, executions)
    ).resolves.toBe(false);
    parser.parse.mockResolvedValueOnce(parsed('empty-1', DataQualityCheckStatus.FAILED));
    await expect(
      options.shouldExecuteQuery?.(plan('empty-1'), examplesQuery, executions)
    ).resolves.toBe(true);
  });

  it('propagates publication failure before SQL and retries with the same persisted id/time', async () => {
    consumption.registerDataQualityRunConsumption
      .mockRejectedValueOnce(new Error('pubsub unavailable'))
      .mockResolvedValueOnce('PUBLISHED');

    await expect(service.executeExistingRun('run-1', 'project-1')).rejects.toThrow(
      'pubsub unavailable'
    );
    expect(dataMartRun.status).toBe(DataMartRunStatus.RUNNING);
    expect(queryBuilder.buildQuery).not.toHaveBeenCalled();

    await service.executeExistingRun('run-1', 'project-1');

    expect(consumption.registerDataQualityRunConsumption).toHaveBeenNthCalledWith(
      1,
      dataMart,
      'run-1',
      startedAt
    );
    expect(consumption.registerDataQualityRunConsumption).toHaveBeenNthCalledWith(
      2,
      dataMart,
      'run-1',
      startedAt
    );
    expect(queryBuilder.buildQuery).toHaveBeenCalledTimes(1);
  });

  it('continues after a check ERROR and finishes the run as FAILED/EXECUTION_FAILED', async () => {
    qualityRun.configSnapshot.rules.push(rule('empty-2'));
    qualityRun.summary.enabledChecks = 2;
    compiler.compile.mockResolvedValueOnce(plan('empty-1')).mockResolvedValueOnce(plan('empty-2'));
    parser.parse
      .mockResolvedValueOnce(parsed('empty-1', DataQualityCheckStatus.ERROR))
      .mockResolvedValueOnce(parsed('empty-2', DataQualityCheckStatus.PASSED));

    await service.executeExistingRun('run-1', 'project-1');

    expect(parser.parse).toHaveBeenCalledTimes(2);
    expect(repositories.get(DataQualityCheckResult)!.save).toHaveBeenCalledTimes(2);
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
    expect(qualityRun.summary).toMatchObject({
      state: DataQualitySummaryState.EXECUTION_FAILED,
      enabledChecks: 2,
      errorChecks: 1,
      passedChecks: 1,
    });
  });

  it('persists a parser exception as ERROR for that rule and continues later rules', async () => {
    qualityRun.configSnapshot.rules.push(rule('empty-2'));
    qualityRun.summary.enabledChecks = 2;
    compiler.compile.mockResolvedValueOnce(plan('empty-1')).mockResolvedValueOnce(plan('empty-2'));
    parser.parse
      .mockRejectedValueOnce(new Error('invalid warehouse payload'))
      .mockResolvedValueOnce(parsed('empty-2', DataQualityCheckStatus.PASSED));

    await service.executeExistingRun('run-1', 'project-1');

    expect(parser.parse).toHaveBeenCalledTimes(2);
    expect(repositories.get(DataQualityCheckResult)!.save).toHaveBeenCalledTimes(2);
    expect(repositories.get(DataQualityCheckResult)!.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ reproductionSql: 'SELECT violations' })
    );
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
    expect(qualityRun.summary).toMatchObject({ errorChecks: 1, passedChecks: 1 });
  });

  it('resumes a durable RUNNING run without republishing or duplicating persisted rules', async () => {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    qualityRun.startedAt = startedAt;
    qualityRun.consumptionPublishedAt = startedAt;
    qualityRun.configSnapshot.rules.push(rule('empty-2'));
    qualityRun.summary.enabledChecks = 2;
    repositories.get(DataQualityCheckResult)!.find.mockResolvedValue([
      {
        dataQualityRunId: qualityRun.id,
        ruleKey: 'empty-1',
        category: DataQualityCategory.EMPTY_TABLE,
        scope: { type: DataQualityScope.DATA_MART },
        severity: DataQualitySeverity.ERROR,
        status: DataQualityCheckStatus.PASSED,
        violationCount: 0,
        description: 'passed',
        examples: [],
        executedSql: ['SELECT existing'],
        reproductionSql: 'SELECT existing',
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
      },
    ] as never);
    compiler.compile.mockResolvedValue(plan('empty-2'));
    parser.parse.mockResolvedValue(parsed('empty-2'));

    await service.executeExistingRun('run-1', 'project-1');

    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
    expect(compiler.compile).toHaveBeenCalledTimes(1);
    expect(compiler.compile).toHaveBeenCalledWith(
      expect.objectContaining({ rule: rule('empty-2') })
    );
    expect(repositories.get(DataQualityCheckResult)!.save).toHaveBeenCalledTimes(1);
    expect(qualityRun.summary).toMatchObject({ enabledChecks: 2, totalChecks: 2, passedChecks: 2 });
  });

  it('does not claim or publish when already aborted before execution starts', async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      service.executeExistingRun('run-1', 'project-1', abortController.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
    expect(dataMartRun.status).toBe(DataMartRunStatus.PENDING);
  });

  it('cancels a durably claimed run without charging when aborted before publication', async () => {
    const abortController = new AbortController();
    let transactions = 0;
    dataSource.transaction.mockImplementation(async callback => {
      const result = await callback(manager);
      if (transactions++ === 0) abortController.abort();
      return result;
    });

    await service.executeExistingRun('run-1', 'project-1', abortController.signal);

    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
    expect(qualityRun.summary.state).toBe(DataQualitySummaryState.CANCELLED);
  });

  it('keeps an aborted run billable when cancellation arrives after publication', async () => {
    const abortController = new AbortController();
    consumption.registerDataQualityRunConsumption.mockImplementation(async () => {
      abortController.abort();
      return 'PUBLISHED';
    });

    await service.executeExistingRun('run-1', 'project-1', abortController.signal);

    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledTimes(1);
    expect(qualityRun.consumptionPublishedAt).not.toBeNull();
    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
  });

  it('persists a completed yielded check before cooperative cancellation stops the next check', async () => {
    const abortController = new AbortController();
    qualityRun.configSnapshot.rules.push(rule('empty-2'));
    qualityRun.summary.enabledChecks = 2;
    compiler.compile.mockResolvedValueOnce(plan('empty-1')).mockResolvedValueOnce(plan('empty-2'));
    executor.executeChecks.mockImplementation(async function* (_dataMart, checks) {
      abortController.abort();
      yield { check: checks[0], executions: [] };
      abortController.signal.throwIfAborted();
      yield { check: checks[1], executions: [] };
    });
    parser.parse.mockResolvedValue(parsed('empty-1'));

    await service.executeExistingRun('run-1', 'project-1', abortController.signal);

    expect(parser.parse).toHaveBeenCalledTimes(1);
    expect(repositories.get(DataQualityCheckResult)!.save).toHaveBeenCalledTimes(1);
    expect(repositories.get(DataQualityCheckResult)!.save).toHaveBeenCalledWith(
      expect.objectContaining({ ruleKey: 'empty-1' })
    );
    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
    expect(qualityRun.summary).toMatchObject({
      state: DataQualitySummaryState.CANCELLED,
      totalChecks: 1,
      passedChecks: 1,
    });
  });

  it('does not overwrite an external cancellation that wins the finalization race', async () => {
    parser.parse.mockImplementation(async () => {
      dataMartRun.status = DataMartRunStatus.CANCELLED;
      dataMartRun.finishedAt = finishedAt;
      return parsed('empty-1');
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
    expect(qualityRun.summary.state).toBe(DataQualitySummaryState.CANCELLED);
  });
});
