import { DataSource, EntityManager, Repository } from 'typeorm';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import {
  DataQualityCheckCompiler,
  DataQualityCompiledCheck,
  DataQualityQueryPurpose,
  createDataQualityCheckCompiler,
} from '../data-quality/data-quality-check-compiler';
import { DataQualityQueryExecutorService } from '../data-quality/data-quality-query-executor.service';
import {
  DataQualityParsedResult,
  DataQualityResultParser,
  createDataQualityResultParser,
} from '../data-quality/data-quality-result-parser';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityStoredCheckResult } from '../dto/schemas/data-quality/data-quality-run.schema';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import { DataQualityConsumptionService } from '../services/data-quality-consumption.service';
import { DataMartTableReferenceService } from '../services/data-mart-table-reference.service';
import { RunDataQualityService } from './run-data-quality.service';
import {
  TriggerExecutionOwnership,
  TriggerExecutionOwnershipError,
} from '../../common/scheduler/shared/trigger-execution-ownership.error';

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

const stored = (
  key: string,
  status = DataQualityCheckStatus.PASSED
): DataQualityStoredCheckResult => ({
  id: `result-${key}`,
  createdAt: '2026-07-15T09:00:00.000Z',
  scope: { type: DataQualityScope.DATA_MART },
  ...parsed(key, status),
});

describe('RunDataQualityService', () => {
  let dataMart: DataMart;
  let dataMartRun: DataMartRun;
  let repositories: Map<unknown, jest.Mocked<Repository<never>>>;
  let manager: jest.Mocked<EntityManager>;
  let dataSource: jest.Mocked<DataSource>;
  let compiler: jest.Mocked<DataQualityCheckCompiler>;
  let executor: jest.Mocked<DataQualityQueryExecutorService>;
  let parser: jest.Mocked<DataQualityResultParser>;
  let consumption: jest.Mocked<ConsumptionTrackingService>;
  let queryBuilder: jest.Mocked<DataMartQueryBuilderFacade>;
  let tableReferenceService: jest.Mocked<DataMartTableReferenceService>;
  let identifierEscaper: jest.Mocked<IdentifierEscaperFacade>;
  let runQueryBuilder: Record<string, jest.Mock>;
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
      createQueryBuilder: jest.fn(),
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
      dataQualitySnapshot: {
        config: { timezone: 'UTC', rules: [rule('empty-1')] },
        schema: null,
        relationships: [],
        definitionType: DataMartDefinitionType.TABLE,
        timezone: 'UTC',
      },
      dataQualitySummary: {
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
      dataQualityResults: [],
      dataQualityConsumptionPublishedAt: null,
    } as unknown as DataMartRun;
    repositories = new Map<unknown, jest.Mocked<Repository<never>>>([
      [DataMartRun, repository()],
      [DataMart, repository()],
    ]);
    repositories.get(DataMart)!.find.mockResolvedValue([]);
    const selectedHiddenColumns = new Set<string>();
    runQueryBuilder = {
      addSelect: jest.fn(),
      innerJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      setLock: jest.fn(),
      getOne: jest.fn(async () => dataMartRun),
    };
    Object.values(runQueryBuilder).forEach(mock => mock.mockReturnValue(runQueryBuilder));
    runQueryBuilder.addSelect.mockImplementation((column: string) => {
      selectedHiddenColumns.add(column);
      return runQueryBuilder;
    });
    runQueryBuilder.getOne.mockImplementation(async () => {
      // Mirror TypeORM's select:false behavior so the service tests fail if either
      // embedded DQ column stops being selected explicitly.
      if (!selectedHiddenColumns.has('run.dataQualitySnapshot')) {
        delete dataMartRun.dataQualitySnapshot;
      }
      if (!selectedHiddenColumns.has('run.dataQualityResults')) {
        delete dataMartRun.dataQualityResults;
      }
      if (!selectedHiddenColumns.has('run.dataQualityConsumptionPublishedAt')) {
        delete dataMartRun.dataQualityConsumptionPublishedAt;
      }
      return dataMartRun;
    });
    repositories
      .get(DataMartRun)!
      .createQueryBuilder.mockImplementation(() => runQueryBuilder as never);
    manager = {
      getRepository: jest.fn(entity => repositories.get(entity)!),
    } as unknown as jest.Mocked<EntityManager>;
    dataSource = {
      options: { type: 'mysql' },
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
    tableReferenceService = {
      resolveTableName: jest.fn(),
    } as unknown as jest.Mocked<DataMartTableReferenceService>;
    identifierEscaper = {
      escapeIdentifier: jest.fn(),
    } as unknown as jest.Mocked<IdentifierEscaperFacade>;
    const clock = {
      now: jest.fn().mockReturnValueOnce(startedAt).mockReturnValue(finishedAt),
    } as unknown as SystemTimeService;
    const consumptionService = new DataQualityConsumptionService(consumption, clock);
    service = new RunDataQualityService(
      dataSource,
      repositories.get(DataMart)! as never,
      queryBuilder,
      tableReferenceService,
      identifierEscaper,
      compiler,
      executor,
      parser,
      consumptionService,
      clock
    );
  });

  it('resolves a SQL main source through its escaped technical view without compiling raw SQL', async () => {
    dataMart.definition = { sqlQuery: 'SELECT secret FROM raw_source' } as never;
    dataMartRun.definitionRun = dataMart.definition;
    dataMartRun.dataQualitySnapshot!.definitionType = DataMartDefinitionType.SQL;
    tableReferenceService.resolveTableName.mockResolvedValue('project.internal.view_dm');
    identifierEscaper.escapeIdentifier.mockResolvedValue('`project`.`internal`.`view_dm`');

    await service.executeExistingRun('run-1', 'project-1');

    expect(tableReferenceService.resolveTableName).toHaveBeenCalledWith('dm-1', 'project-1');
    expect(identifierEscaper.escapeIdentifier).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      'project.internal.view_dm'
    );
    expect(compiler.compile).toHaveBeenCalledWith(
      expect.objectContaining({ sourceQuery: 'SELECT * FROM `project`.`internal`.`view_dm`' })
    );
    expect(JSON.stringify(compiler.compile.mock.calls)).not.toContain('raw_source');
    expect(queryBuilder.buildQuery).not.toHaveBeenCalled();
  });

  it('keeps TABLE main sources on the existing query-builder path', async () => {
    await service.executeExistingRun('run-1', 'project-1');

    expect(queryBuilder.buildQuery).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      dataMartRun.definitionRun
    );
    expect(tableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(identifierEscaper.escapeIdentifier).not.toHaveBeenCalled();
  });

  it('executes and stores real compiler SQL backed by main and relationship technical views', async () => {
    const mainRule = rule('empty_table:data_mart');
    const sourceSchema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'source_pk',
          type: 'STRING',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: true,
          isHiddenForReporting: false,
        },
        {
          name: 'customer_id',
          type: 'STRING',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
      ],
    };
    const targetSchema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'id',
          type: 'STRING',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: true,
          isHiddenForReporting: false,
        },
      ],
    };
    const relationshipRule = {
      key: 'relationship_integrity:relationship:rel-1',
      category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
      scope: { type: DataQualityScope.RELATIONSHIP as const, relationshipId: 'rel-1' },
      severity: DataQualitySeverity.WARNING,
      enabled: true,
      isApplicable: true,
      parameters: {},
    };
    const target = {
      id: 'dm-2',
      projectId: 'project-1',
      definition: { sqlQuery: 'SELECT target_secret FROM raw_target' },
      schema: targetSchema,
      storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
    } as unknown as DataMart;
    dataMart.definition = { sqlQuery: 'SELECT source_secret FROM raw_source' } as never;
    dataMartRun.definitionRun = dataMart.definition;
    dataMartRun.dataQualitySnapshot!.definitionType = DataMartDefinitionType.SQL;
    dataMartRun.dataQualitySnapshot!.schema = sourceSchema as never;
    dataMartRun.dataQualitySnapshot!.config.rules = [mainRule, relationshipRule];
    dataMartRun.dataQualitySnapshot!.relationships = [
      {
        id: 'rel-1',
        sourceDataMartId: 'dm-1',
        targetDataMartId: 'dm-2',
        targetAlias: 'target',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
      },
    ];
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    repositories.get(DataMart)!.find.mockResolvedValue([target] as never);
    tableReferenceService.resolveTableName.mockImplementation(async id =>
      id === 'dm-1' ? 'project.internal.view_source' : 'project.internal.view_target'
    );
    identifierEscaper.escapeIdentifier.mockImplementation(async (_type, reference) =>
      reference === 'project.internal.view_source'
        ? '`project`.`internal`.`view_source`'
        : '`project`.`internal`.`view_target`'
    );
    const realCompiler = createDataQualityCheckCompiler();
    const realParser = createDataQualityResultParser();
    const emittedSql: string[] = [];
    compiler.compile.mockImplementation(input => realCompiler.compile(input));
    parser.parse.mockImplementation((storageType, check, executions, options) =>
      realParser.parse(storageType, check, executions, options)
    );
    executor.executeChecks.mockImplementation(async function* (_dataMart, checks) {
      for (const check of checks) {
        if (check.kind === 'NOT_APPLICABLE') {
          yield { check, executions: [] };
          continue;
        }
        const measurement = check.queries.find(
          query => query.purpose === DataQualityQueryPurpose.MEASUREMENT
        );
        if (!measurement) throw new Error(`Missing measurement SQL for ${check.ruleKey}`);
        emittedSql.push(measurement.sql);
        yield {
          check,
          executions: [
            {
              purpose: DataQualityQueryPurpose.MEASUREMENT,
              sql: measurement.sql,
              rows: [{ violation_count: 0, is_applicable: 1 }],
            },
          ],
        };
      }
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.dataQualityResults).toHaveLength(2);
    expect(emittedSql).toHaveLength(2);
    expect(emittedSql[0]).toContain('SELECT * FROM `project`.`internal`.`view_source`');
    expect(emittedSql[1]).toContain('SELECT * FROM `project`.`internal`.`view_source`');
    expect(emittedSql[1]).toContain('SELECT * FROM `project`.`internal`.`view_target`');

    const mainResult = dataMartRun.dataQualityResults?.find(
      result => result.ruleKey === mainRule.key
    );
    const relationshipResult = dataMartRun.dataQualityResults?.find(
      result => result.ruleKey === relationshipRule.key
    );
    expect(mainResult).toMatchObject({
      status: DataQualityCheckStatus.PASSED,
      executedSql: [expect.stringContaining('`project`.`internal`.`view_source`')],
      reproductionSql: expect.stringContaining('`project`.`internal`.`view_source`'),
    });
    expect(relationshipResult).toMatchObject({
      status: DataQualityCheckStatus.PASSED,
      executedSql: [expect.stringContaining('`project`.`internal`.`view_target`')],
      reproductionSql: expect.stringContaining('`project`.`internal`.`view_target`'),
    });
    const allSql = JSON.stringify({ emittedSql, results: dataMartRun.dataQualityResults });
    expect(allSql).not.toContain('raw_source');
    expect(allSql).not.toContain('raw_target');
  });

  it('refreshes a shared SQL relationship target only once per run', async () => {
    const target = {
      id: 'dm-2',
      projectId: 'project-1',
      definition: { sqlQuery: 'SELECT target_secret FROM raw_target' },
      schema: { fields: [] },
      storage: { id: 'storage-2', type: DataStorageType.GOOGLE_BIGQUERY },
    } as unknown as DataMart;
    dataMartRun.dataQualitySnapshot!.config.rules = ['rel-1', 'rel-2'].map(key => ({
      ...rule(key),
      scope: { type: DataQualityScope.RELATIONSHIP as const, relationshipId: key },
    }));
    dataMartRun.dataQualitySnapshot!.relationships = ['rel-1', 'rel-2'].map(id => ({
      id,
      sourceDataMartId: 'dm-1',
      targetDataMartId: 'dm-2',
      targetAlias: 'target',
      joinConditions: [],
    }));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    repositories.get(DataMart)!.find.mockResolvedValue([target] as never);
    tableReferenceService.resolveTableName.mockResolvedValue('project.internal.view_target');
    identifierEscaper.escapeIdentifier.mockResolvedValue('`project`.`internal`.`view_target`');
    compiler.compile.mockImplementation(async input => {
      const relationship = input.relationship as
        | { resolveTargetSourceQuery?: () => Promise<unknown> }
        | undefined;
      await relationship?.resolveTargetSourceQuery?.();
      return plan(input.rule.key);
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(tableReferenceService.resolveTableName).toHaveBeenCalledTimes(1);
    expect(tableReferenceService.resolveTableName).toHaveBeenCalledWith('dm-2', 'project-1');
    expect(identifierEscaper.escapeIdentifier).toHaveBeenCalledTimes(1);
  });

  it('does not refresh an incompatible relationship target and still completes an independent rule', async () => {
    const relationshipRule = {
      key: 'relationship_integrity:relationship:rel-1',
      category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
      scope: { type: DataQualityScope.RELATIONSHIP as const, relationshipId: 'rel-1' },
      severity: DataQualitySeverity.WARNING,
      enabled: true,
      isApplicable: true,
      parameters: {},
    };
    const independentRule = rule('empty_table:data_mart');
    const sourceSchema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'customer_id',
          type: 'STRING',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
      ],
    };
    const target = {
      id: 'dm-2',
      projectId: 'project-1',
      definition: { sqlQuery: 'SELECT id FROM raw_target' },
      schema: {
        type: 'snowflake-data-mart-schema',
        fields: [
          {
            name: 'id',
            type: 'STRING',
            status: DataMartSchemaFieldStatus.CONNECTED,
            isPrimaryKey: true,
            isHiddenForReporting: false,
          },
        ],
      },
      storage: { id: 'storage-1', type: DataStorageType.SNOWFLAKE },
    } as unknown as DataMart;
    dataMartRun.dataQualitySnapshot!.schema = sourceSchema as never;
    dataMartRun.dataQualitySnapshot!.config.rules = [relationshipRule, independentRule];
    dataMartRun.dataQualitySnapshot!.relationships = [
      {
        id: 'rel-1',
        sourceDataMartId: 'dm-1',
        targetDataMartId: 'dm-2',
        targetAlias: 'target',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
      },
    ];
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    repositories.get(DataMart)!.find.mockResolvedValue([target] as never);
    const realCompiler = createDataQualityCheckCompiler();
    const realParser = createDataQualityResultParser();
    compiler.compile.mockImplementation(input => realCompiler.compile(input));
    parser.parse.mockImplementation(async (_storage, check, executions) =>
      check.kind === 'NOT_APPLICABLE'
        ? realParser.parse(DataStorageType.GOOGLE_BIGQUERY, check, executions)
        : parsed(check.ruleKey)
    );

    await service.executeExistingRun('run-1', 'project-1');

    expect(tableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(identifierEscaper.escapeIdentifier).not.toHaveBeenCalled();
    expect(dataMartRun.dataQualityResults).toEqual([
      expect.objectContaining({
        ruleKey: relationshipRule.key,
        status: DataQualityCheckStatus.NOT_APPLICABLE,
      }),
      expect.objectContaining({
        ruleKey: independentRule.key,
        status: DataQualityCheckStatus.PASSED,
      }),
    ]);
    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
  });

  it('sanitizes a relationship view error, preserves provider identity, and completes an independent rule', async () => {
    const relationshipRule = {
      key: 'relationship_integrity:relationship:rel-1',
      category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
      scope: { type: DataQualityScope.RELATIONSHIP as const, relationshipId: 'rel-1' },
      severity: DataQualitySeverity.WARNING,
      enabled: true,
      isApplicable: true,
      parameters: {},
    };
    const independentRule = rule('empty_table:data_mart');
    const sourceSchema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'customer_id',
          type: 'STRING',
          mode: 'NULLABLE',
          status: DataMartSchemaFieldStatus.CONNECTED,
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
      ],
    };
    const target = {
      id: 'dm-2',
      projectId: 'project-1',
      definition: { sqlQuery: 'SELECT target_secret FROM raw_target' },
      schema: {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'id',
            type: 'STRING',
            mode: 'NULLABLE',
            status: DataMartSchemaFieldStatus.CONNECTED,
            isPrimaryKey: true,
            isHiddenForReporting: false,
          },
        ],
      },
      storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
    } as unknown as DataMart;
    dataMartRun.dataQualitySnapshot!.schema = sourceSchema as never;
    dataMartRun.dataQualitySnapshot!.config.rules = [relationshipRule, independentRule];
    dataMartRun.dataQualitySnapshot!.relationships = [
      {
        id: 'rel-1',
        sourceDataMartId: 'dm-1',
        targetDataMartId: 'dm-2',
        targetAlias: 'target',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
      },
    ];
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    repositories.get(DataMart)!.find.mockResolvedValue([target] as never);
    const sensitiveMarker = 'CREATE VIEW hidden AS SELECT secret FROM private_table';
    const providerError = Object.assign(new Error(sensitiveMarker), {
      code: 'BQ_VIEW_REFRESH_FAILED',
      reason: 'invalidQuery',
    });
    tableReferenceService.resolveTableName.mockRejectedValue(providerError);
    const realCompiler = createDataQualityCheckCompiler();
    let capturedBoundaryError: unknown;
    compiler.compile.mockImplementation(async input => {
      try {
        return await realCompiler.compile(input);
      } catch (error) {
        capturedBoundaryError = error;
        throw error;
      }
    });
    parser.parse.mockImplementation(async (_storage, check) => parsed(check.ruleKey));

    await service.executeExistingRun('run-1', 'project-1');

    expect(compiler.compile).toHaveBeenCalledTimes(2);
    expect(compiler.compile).toHaveBeenCalledWith(
      expect.objectContaining({
        rule: expect.objectContaining({ key: 'empty_table:data_mart' }),
      })
    );
    expect(dataMartRun.dataQualityResults).toEqual([
      expect.objectContaining({
        ruleKey: relationshipRule.key,
        status: DataQualityCheckStatus.ERROR,
        description: 'Failed to refresh Data Quality technical view',
        error: {
          code: 'BQ_VIEW_REFRESH_FAILED',
          message: 'Failed to refresh Data Quality technical view',
          details: {
            dataQualityCode: 'DATA_QUALITY_EXECUTION_ERROR',
            providerCode: 'BQ_VIEW_REFRESH_FAILED',
            providerReason: 'invalidQuery',
          },
        },
      }),
      expect.objectContaining({
        ruleKey: 'empty_table:data_mart',
        status: DataQualityCheckStatus.PASSED,
      }),
    ]);
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
    expect(dataMartRun.dataQualitySummary).toMatchObject({
      state: DataQualitySummaryState.EXECUTION_FAILED,
      errorChecks: 1,
      passedChecks: 1,
    });
    expect(JSON.stringify(dataMartRun.dataQualityResults)).not.toContain(sensitiveMarker);
    expect(capturedBoundaryError).toMatchObject({
      message: 'Failed to refresh Data Quality technical view',
      code: 'BQ_VIEW_REFRESH_FAILED',
      reason: 'invalidQuery',
      cause: providerError,
    });
  });

  it('stores ERROR results and terminalizes when the main SQL view cannot be refreshed', async () => {
    dataMart.definition = { sqlQuery: 'SELECT secret FROM raw_source' } as never;
    dataMartRun.definitionRun = dataMart.definition;
    dataMartRun.dataQualitySnapshot!.definitionType = DataMartDefinitionType.SQL;
    const sensitiveMarker = 'CREATE VIEW hidden AS SELECT secret FROM raw_source';
    tableReferenceService.resolveTableName.mockRejectedValue(
      Object.assign(new Error(sensitiveMarker), { errorCode: 'VIEW_REFRESH_FAILED' })
    );

    await service.executeExistingRun('run-1', 'project-1');

    expect(compiler.compile).not.toHaveBeenCalled();
    expect(executor.executeChecks).not.toHaveBeenCalled();
    expect(dataMartRun.dataQualityResults).toEqual([
      expect.objectContaining({
        ruleKey: 'empty-1',
        status: DataQualityCheckStatus.ERROR,
        error: expect.objectContaining({
          code: 'VIEW_REFRESH_FAILED',
          message: 'Failed to refresh Data Quality technical view',
          details: expect.objectContaining({
            dataQualityCode: 'DATA_QUALITY_EXECUTION_ERROR',
            providerErrorCode: 'VIEW_REFRESH_FAILED',
          }),
        }),
      }),
    ]);
    expect(JSON.stringify(dataMartRun.dataQualityResults)).not.toContain(sensitiveMarker);
    expect(dataMartRun.dataQualitySummary?.state).toBe(DataQualitySummaryState.EXECUTION_FAILED);
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
  });

  it('claims RUNNING durably, publishes once, persists each result, and finishes findings as SUCCESS/ISSUES', async () => {
    parser.parse.mockResolvedValue(parsed('empty-1', DataQualityCheckStatus.FAILED));

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
    expect(dataMartRun.startedAt).toEqual(startedAt);
    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledWith(
      dataMart,
      'run-1',
      startedAt
    );
    expect(dataMartRun.dataQualityResults).toHaveLength(1);
    expect(dataMartRun.dataQualityResults?.[0]).toMatchObject({
      ruleKey: 'empty-1',
      scope: { type: DataQualityScope.DATA_MART },
      createdAt: finishedAt.toISOString(),
    });
    expect(dataMartRun.dataQualitySummary).toMatchObject({
      state: DataQualitySummaryState.ISSUES,
      enabledChecks: 1,
      failedChecks: 1,
    });
    expect(dataMartRun.dataQualityConsumptionPublishedAt).toEqual(finishedAt);
  });

  it('explicitly loads the hidden snapshot and existing results when resuming a run', async () => {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    dataMartRun.dataQualitySummary!.state = DataQualitySummaryState.RUNNING;
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    dataMartRun.dataQualityConsumptionPublishedAt = startedAt;
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualityResults = [stored('empty-1')];
    compiler.compile.mockImplementation(async input => plan(input.rule.key));
    parser.parse.mockImplementation(async (_storage, check) => parsed(check.ruleKey));

    await service.executeExistingRun('run-1', 'project-1');

    expect(runQueryBuilder.addSelect).toHaveBeenCalledWith('run.dataQualitySnapshot');
    expect(runQueryBuilder.addSelect).toHaveBeenCalledWith('run.dataQualityResults');
    expect(compiler.compile).toHaveBeenCalledTimes(1);
    expect(compiler.compile).toHaveBeenCalledWith(
      expect.objectContaining({ rule: expect.objectContaining({ key: 'empty-2' }) })
    );
    expect(dataMartRun.dataQualityResults?.map(result => result.ruleKey)).toEqual([
      'empty-1',
      'empty-2',
    ]);
  });

  it('loads the Data Mart storage with the claimed aggregate', async () => {
    await service.executeExistingRun('run-1', 'project-1');

    expect(runQueryBuilder.innerJoinAndSelect).toHaveBeenCalledWith('run.dataMart', 'dataMart');
    expect(runQueryBuilder.innerJoinAndSelect).toHaveBeenCalledWith('dataMart.storage', 'storage');
  });

  it('writes the billing marker on DataMartRun only after RUNNING is durable', async () => {
    consumption.registerDataQualityRunConsumption.mockImplementation(async () => {
      expect(dataMartRun).toMatchObject({
        status: DataMartRunStatus.RUNNING,
        startedAt,
        dataQualitySummary: expect.objectContaining({ state: DataQualitySummaryState.RUNNING }),
      });
      expect(repositories.get(DataMartRun)!.update).toHaveBeenCalledWith(
        { id: 'run-1', status: DataMartRunStatus.RUNNING },
        {
          dataQualitySummary: expect.objectContaining({
            state: DataQualitySummaryState.RUNNING,
          }),
        }
      );
      return 'PUBLISHED';
    });

    await service.executeExistingRun('run-1', 'project-1');

    const markerUpdate = repositories
      .get(DataMartRun)!
      .update.mock.calls.find(([, value]) =>
        Object.prototype.hasOwnProperty.call(value as object, 'dataQualityConsumptionPublishedAt')
      );
    expect(markerUpdate?.[0]).toMatchObject({
      id: 'run-1',
      dataQualityConsumptionPublishedAt: expect.anything(),
    });
  });

  it('requests examples only when the preliminary measurement is a finding', async () => {
    await service.executeExistingRun('run-1', 'project-1');

    const options = executor.executeChecks.mock.calls[0]![2]!;
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

  it('retries a commit-unknown publication with the same idempotency identity', async () => {
    const runRepository = repositories.get(DataMartRun)!;
    let loseMarkerAcknowledgement = true;
    runRepository.update.mockImplementation(async (_criteria, partial) => {
      if (
        loseMarkerAcknowledgement &&
        Object.prototype.hasOwnProperty.call(partial as object, 'dataQualityConsumptionPublishedAt')
      ) {
        loseMarkerAcknowledgement = false;
        throw new Error('marker commit acknowledgement lost');
      }
      return { affected: 1, raw: [], generatedMaps: [] };
    });

    await expect(service.executeExistingRun('run-1', 'project-1')).rejects.toThrow(
      'marker commit acknowledgement lost'
    );
    expect(dataMartRun).toMatchObject({
      status: DataMartRunStatus.RUNNING,
      startedAt,
      dataQualityConsumptionPublishedAt: null,
    });
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
    expect(dataMartRun.dataQualityConsumptionPublishedAt).toEqual(finishedAt);
  });

  it('continues after a check ERROR and preserves embedded results on FAILED/EXECUTION_FAILED', async () => {
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    compiler.compile.mockResolvedValueOnce(plan('empty-1')).mockResolvedValueOnce(plan('empty-2'));
    parser.parse
      .mockResolvedValueOnce(parsed('empty-1', DataQualityCheckStatus.ERROR))
      .mockResolvedValueOnce(parsed('empty-2', DataQualityCheckStatus.PASSED));

    await service.executeExistingRun('run-1', 'project-1');

    expect(parser.parse).toHaveBeenCalledTimes(2);
    expect(dataMartRun.dataQualityResults?.map(result => result.ruleKey)).toEqual([
      'empty-1',
      'empty-2',
    ]);
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
    expect(dataMartRun.dataQualitySummary).toMatchObject({
      state: DataQualitySummaryState.EXECUTION_FAILED,
      enabledChecks: 2,
      errorChecks: 1,
      passedChecks: 1,
    });
  });

  it('persists a parser exception as ERROR for that rule and continues later rules', async () => {
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    compiler.compile.mockResolvedValueOnce(plan('empty-1')).mockResolvedValueOnce(plan('empty-2'));
    parser.parse
      .mockRejectedValueOnce(new Error('invalid warehouse payload'))
      .mockResolvedValueOnce(parsed('empty-2', DataQualityCheckStatus.PASSED));

    await service.executeExistingRun('run-1', 'project-1');

    expect(parser.parse).toHaveBeenCalledTimes(2);
    expect(dataMartRun.dataQualityResults?.[0]).toMatchObject({
      ruleKey: 'empty-1',
      reproductionSql: 'SELECT violations',
      error: expect.objectContaining({ code: 'DATA_QUALITY_EXECUTION_ERROR' }),
    });
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
    expect(dataMartRun.dataQualitySummary).toMatchObject({ errorChecks: 1, passedChecks: 1 });
  });

  it('skips an existing embedded rule key when resuming a durable RUNNING run', async () => {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    dataMartRun.dataQualityConsumptionPublishedAt = startedAt;
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    dataMartRun.dataQualityResults = [stored('empty-1')];
    compiler.compile.mockResolvedValue(plan('empty-2'));
    parser.parse.mockResolvedValue(parsed('empty-2'));

    await service.executeExistingRun('run-1', 'project-1');

    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
    expect(compiler.compile).toHaveBeenCalledTimes(1);
    expect(compiler.compile).toHaveBeenCalledWith(
      expect.objectContaining({ rule: rule('empty-2') })
    );
    expect(dataMartRun.dataQualityResults?.map(result => result.ruleKey)).toEqual([
      'empty-1',
      'empty-2',
    ]);
    expect(dataMartRun.dataQualitySummary).toMatchObject({
      enabledChecks: 2,
      totalChecks: 2,
      passedChecks: 2,
    });
  });

  it('stores a completed check before the next warehouse query starts', async () => {
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    compiler.compile.mockResolvedValueOnce(plan('empty-1')).mockResolvedValueOnce(plan('empty-2'));
    const sequence: string[] = [];
    executor.executeChecks.mockImplementation(async function* (_dataMart, checks) {
      sequence.push(`query:${checks[0].ruleKey}`);
      yield { check: checks[0], executions: [] };
      sequence.push(
        dataMartRun.dataQualityResults?.some(result => result.ruleKey === checks[0].ruleKey)
          ? `stored:${checks[0].ruleKey}`
          : `missing:${checks[0].ruleKey}`
      );
      sequence.push(`query:${checks[1].ruleKey}`);
      yield { check: checks[1], executions: [] };
    });
    parser.parse.mockImplementation(async (_storage, check) => parsed(check.ruleKey));

    await service.executeExistingRun('run-1', 'project-1');

    expect(sequence).toEqual(['query:empty-1', 'stored:empty-1', 'query:empty-2']);
  });

  it('propagates an execution-ownership loss between SQL statements without fabricating results', async () => {
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    compiler.compile.mockResolvedValueOnce(plan('empty-1')).mockResolvedValueOnce(plan('empty-2'));
    const ownershipError = new TriggerExecutionOwnershipError('trigger-1', 4);
    let atWarehouseBoundary = false;
    const ownership = {
      assertOwned: jest.fn(async () => {
        if (atWarehouseBoundary) throw ownershipError;
      }),
    };
    executor.executeChecks.mockImplementation(async function* (_dataMart, checks, options) {
      atWarehouseBoundary = true;
      await options?.beforeExecuteQuery?.(checks[0], checks[0].queries[0]);
      yield { check: checks[0], executions: [] };
    });

    await expect(
      service.executeExistingRun('run-1', 'project-1', undefined, ownership)
    ).rejects.toBe(ownershipError);

    expect(dataMartRun.status).toBe(DataMartRunStatus.RUNNING);
    expect(dataMartRun.dataQualitySummary?.state).toBe(DataQualitySummaryState.RUNNING);
    expect(dataMartRun.dataQualityResults).toEqual([]);
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('revalidates the trigger epoch inside the claim transaction before mutating the run', async () => {
    const ownershipError = new TriggerExecutionOwnershipError('trigger-1', 4);
    const ownership: TriggerExecutionOwnership = {
      assertOwned: jest.fn(async transactionManager => {
        if (transactionManager) throw ownershipError;
      }),
    };

    await expect(
      service.executeExistingRun('run-1', 'project-1', undefined, ownership)
    ).rejects.toBe(ownershipError);

    expect(dataMartRun.status).toBe(DataMartRunStatus.PENDING);
    expect(repositories.get(DataMartRun)!.save).not.toHaveBeenCalled();
  });

  it('revalidates the trigger epoch inside the result transaction before appending', async () => {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    dataMartRun.dataQualitySummary!.state = DataQualitySummaryState.RUNNING;
    dataMartRun.dataQualityConsumptionPublishedAt = startedAt;
    const ownershipError = new TriggerExecutionOwnershipError('trigger-1', 4);
    let transactionalAssertions = 0;
    const ownership: TriggerExecutionOwnership = {
      assertOwned: jest.fn(async transactionManager => {
        if (transactionManager && ++transactionalAssertions === 2) throw ownershipError;
      }),
    };

    await expect(
      service.executeExistingRun('run-1', 'project-1', undefined, ownership)
    ).rejects.toBe(ownershipError);

    expect(transactionalAssertions).toBe(2);
    expect(dataMartRun.status).toBe(DataMartRunStatus.RUNNING);
    expect(dataMartRun.dataQualityResults).toEqual([]);
  });

  it('revalidates the trigger epoch inside the finalization transaction before terminalizing', async () => {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    dataMartRun.dataQualitySummary!.state = DataQualitySummaryState.RUNNING;
    dataMartRun.dataQualityResults = [stored('empty-1')];
    dataMartRun.dataQualityConsumptionPublishedAt = startedAt;
    const ownershipError = new TriggerExecutionOwnershipError('trigger-1', 4);
    let transactionalAssertions = 0;
    const ownership: TriggerExecutionOwnership = {
      assertOwned: jest.fn(async transactionManager => {
        if (transactionManager && ++transactionalAssertions === 2) throw ownershipError;
      }),
    };

    await expect(
      service.executeExistingRun('run-1', 'project-1', undefined, ownership)
    ).rejects.toBe(ownershipError);

    expect(transactionalAssertions).toBe(2);
    expect(dataMartRun.status).toBe(DataMartRunStatus.RUNNING);
    expect(dataMartRun.finishedAt).toBeNull();
  });

  it('upserts duplicate persistence for the same rule key instead of appending twice', async () => {
    executor.executeChecks.mockImplementation(async function* (_dataMart, checks) {
      yield { check: checks[0], executions: [] };
      yield { check: checks[0], executions: [] };
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.dataQualityResults).toHaveLength(1);
    expect(dataMartRun.dataQualityResults?.[0].ruleKey).toBe('empty-1');
    expect(dataMartRun.dataQualitySummary?.totalChecks).toBe(1);
  });

  it.each([
    [DataMartRunStatus.SUCCESS, DataQualitySummaryState.PASSED, []],
    [
      DataMartRunStatus.FAILED,
      DataQualitySummaryState.EXECUTION_FAILED,
      ['external terminalization'],
    ],
  ])(
    'does not append or overwrite an externally terminal %s run',
    async (status, summaryState, errors) => {
      parser.parse.mockImplementation(async () => {
        dataMartRun.status = status;
        dataMartRun.finishedAt = finishedAt;
        dataMartRun.errors = errors;
        dataMartRun.dataQualitySummary = {
          ...dataMartRun.dataQualitySummary!,
          state: summaryState,
        };
        return parsed('empty-1');
      });

      await service.executeExistingRun('run-1', 'project-1');

      expect(dataMartRun).toMatchObject({
        status,
        finishedAt,
        errors,
        dataQualitySummary: expect.objectContaining({ state: summaryState }),
        dataQualityResults: [],
      });
    }
  );

  it('leaves the run resumable without fabricated errors when result storage rolls back', async () => {
    const runRepository = repositories.get(DataMartRun)!;
    let rejectResultSave = true;
    runRepository.save.mockImplementation(async value => {
      const run = value as unknown as DataMartRun;
      if (rejectResultSave && run.dataQualityResults?.length) {
        rejectResultSave = false;
        run.dataQualityResults = [];
        throw new Error('result storage unavailable');
      }
      return value;
    });

    await expect(service.executeExistingRun('run-1', 'project-1')).rejects.toThrow(
      'result storage unavailable'
    );

    expect(dataMartRun.status).toBe(DataMartRunStatus.RUNNING);
    expect(dataMartRun.dataQualitySummary?.state).toBe(DataQualitySummaryState.RUNNING);
    expect(dataMartRun.dataQualityResults).toEqual([]);
    expect(parser.parse).toHaveBeenCalledTimes(1);
  });

  it('keeps a committed PASS and skips it when result-storage acknowledgement is lost', async () => {
    const runRepository = repositories.get(DataMartRun)!;
    let loseAcknowledgement = true;
    runRepository.save.mockImplementation(async value => {
      const run = value as unknown as DataMartRun;
      if (loseAcknowledgement && run.dataQualityResults?.[0]?.status) {
        loseAcknowledgement = false;
        throw new Error('result acknowledgement lost');
      }
      return value;
    });

    await expect(service.executeExistingRun('run-1', 'project-1')).rejects.toThrow(
      'result acknowledgement lost'
    );
    expect(dataMartRun.dataQualityResults).toEqual([
      expect.objectContaining({ ruleKey: 'empty-1', status: DataQualityCheckStatus.PASSED }),
    ]);

    await service.executeExistingRun('run-1', 'project-1');

    expect(parser.parse).toHaveBeenCalledTimes(1);
    expect(dataMartRun.dataQualityResults).toHaveLength(1);
    expect(dataMartRun.dataQualityResults?.[0]).toMatchObject({
      ruleKey: 'empty-1',
      status: DataQualityCheckStatus.PASSED,
    });
    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
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

  it('settles consumption before cancelling when abort arrives immediately after durable claim', async () => {
    const abortController = new AbortController();
    let transactions = 0;
    dataSource.transaction.mockImplementation(async callback => {
      const runInTransaction = callback as unknown as (
        entityManager: EntityManager
      ) => Promise<unknown>;
      const result = await runInTransaction(manager);
      if (transactions++ === 0) abortController.abort();
      return result;
    });

    await service.executeExistingRun('run-1', 'project-1', abortController.signal);

    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledWith(
      dataMart,
      'run-1',
      startedAt
    );
    expect(dataMartRun.dataQualityConsumptionPublishedAt).toEqual(finishedAt);
    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
    expect(dataMartRun.dataQualitySummary?.state).toBe(DataQualitySummaryState.CANCELLED);
    expect(dataMartRun.dataQualityResults).toEqual([]);
  });

  it('durably marks disabled consumption tracking as settled before SQL', async () => {
    consumption.registerDataQualityRunConsumption.mockResolvedValue('DISABLED');

    await service.executeExistingRun('run-1', 'project-1');

    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledWith(
      dataMart,
      'run-1',
      startedAt
    );
    expect(dataMartRun.dataQualityConsumptionPublishedAt).toEqual(finishedAt);
    expect(queryBuilder.buildQuery).toHaveBeenCalledTimes(1);
  });

  it('keeps an aborted run billable when cancellation arrives after publication', async () => {
    const abortController = new AbortController();
    consumption.registerDataQualityRunConsumption.mockImplementation(async () => {
      abortController.abort();
      return 'PUBLISHED';
    });

    await service.executeExistingRun('run-1', 'project-1', abortController.signal);

    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledTimes(1);
    expect(dataMartRun.dataQualityConsumptionPublishedAt).not.toBeNull();
    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
  });

  it('persists the billing marker when external cancellation wins after publication', async () => {
    consumption.registerDataQualityRunConsumption.mockImplementation(async () => {
      dataMartRun.status = DataMartRunStatus.CANCELLED;
      dataMartRun.finishedAt = finishedAt;
      return 'PUBLISHED';
    });
    repositories.get(DataMartRun)!.update.mockImplementation(async criteria => ({
      affected:
        'status' in (criteria as object) && dataMartRun.status === DataMartRunStatus.CANCELLED
          ? 0
          : 1,
      raw: [],
      generatedMaps: [],
    }));

    await service.executeExistingRun('run-1', 'project-1');

    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledTimes(1);
    expect(dataMartRun.dataQualityConsumptionPublishedAt).toEqual(finishedAt);
    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
  });

  it('preserves a completed embedded check when cooperative cancellation stops the next check', async () => {
    const abortController = new AbortController();
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
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
    expect(dataMartRun.dataQualityResults).toHaveLength(1);
    expect(dataMartRun.dataQualityResults?.[0].ruleKey).toBe('empty-1');
    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
    expect(dataMartRun.dataQualitySummary).toMatchObject({
      state: DataQualitySummaryState.CANCELLED,
      totalChecks: 1,
      passedChecks: 1,
    });
  });

  it('does not overwrite an external cancellation that wins the finalization race', async () => {
    parser.parse.mockImplementation(async () => {
      dataMartRun.status = DataMartRunStatus.CANCELLED;
      dataMartRun.finishedAt = finishedAt;
      dataMartRun.dataQualitySummary = {
        ...dataMartRun.dataQualitySummary!,
        state: DataQualitySummaryState.CANCELLED,
      };
      return parsed('empty-1');
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.status).toBe(DataMartRunStatus.CANCELLED);
    expect(dataMartRun.dataQualitySummary?.state).toBe(DataQualitySummaryState.CANCELLED);
    expect(dataMartRun.dataQualityResults).toEqual([]);
  });
});
