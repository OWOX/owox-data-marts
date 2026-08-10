import { DataSource, EntityManager, Repository } from 'typeorm';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import {
  DataQualityCheckCompiler,
  DataQualityCompiledCheck,
  createDataQualityCheckCompiler,
} from '../data-quality/data-quality-check-compiler';
import { DataQualityQueryExecutorService } from '../data-quality/data-quality-query-executor.service';
import {
  DataQualityParsedResult,
  DataQualityResultParser,
  createDataQualityResultParser,
} from '../data-quality/data-quality-result-parser';
import { BigQueryFieldMode } from '../data-storage-types/bigquery/enums/bigquery-field-mode.enum';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ProjectBlockedReason } from '../enums/project-blocked-reason.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityStoredCheckResult } from '../dto/schemas/data-quality/data-quality-run.schema';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import { ProjectBalanceService } from '../services/project-balance.service';
import {
  DataQualitySnapshotStorageMismatchError,
  DataQualitySnapshotTableReferenceService,
} from '../data-quality/data-quality-snapshot-table-reference.service';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
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
  sql: 'SELECT one unified result',
  resultShape: {
    exampleMarkerColumn: 'example_available',
    exampleColumns: [],
  },
});

const parsed = (key: string, status = DataQualityCheckStatus.PASSED): DataQualityParsedResult => ({
  category: DataQualityCategory.EMPTY_TABLE,
  ruleKey: key,
  severity: DataQualitySeverity.ERROR,
  status,
  violationCount: status === DataQualityCheckStatus.FAILED ? 1 : 0,
  description: status === DataQualityCheckStatus.FAILED ? 'issue' : 'passed',
  examples: [],
  sql: 'SELECT one unified result',
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

const snapshotReference = (query: string) => ({
  buildQuery: jest.fn(async () => query),
});

const projectedSnapshotReference = (table: string) => ({
  buildQuery: jest.fn(async (columns: string[]) => {
    const projection = columns.length > 0 ? columns.join(', ') : '*';
    return `SELECT ${projection} FROM ${table}`;
  }),
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
  let projectBalance: jest.Mocked<ProjectBalanceService>;
  let snapshotTableReference: jest.Mocked<DataQualitySnapshotTableReferenceService>;
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
        config: { rules: [rule('empty-1')] },
        schema: null,
        relationships: [],
        definitionType: DataMartDefinitionType.TABLE,
        sourceStorage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
        relationshipTargets: [],
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
    } as unknown as DataMartRun;
    repositories = new Map<unknown, jest.Mocked<Repository<never>>>([
      [DataMartRun, repository()],
      [DataMart, repository()],
    ]);
    repositories.get(DataMart)!.find.mockResolvedValue([]);
    const selectedHiddenColumns = new Set<string>();
    runQueryBuilder = {
      select: jest.fn(),
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
        for (const check of checks) yield { check, execution: null };
      }),
    } as never;
    parser = { parse: jest.fn().mockResolvedValue(parsed('empty-1')) } as never;
    consumption = {
      registerDataQualityRunConsumption: jest.fn().mockResolvedValue(undefined),
    } as never;
    projectBalance = {
      verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
    } as never;
    snapshotTableReference = {
      resolve: jest.fn().mockResolvedValue(snapshotReference('SELECT * FROM source')),
    } as unknown as jest.Mocked<DataQualitySnapshotTableReferenceService>;
    const clock = {
      now: jest.fn().mockReturnValueOnce(startedAt).mockReturnValue(finishedAt),
    } as unknown as SystemTimeService;
    service = new RunDataQualityService(
      dataSource,
      repositories.get(DataMart)! as never,
      snapshotTableReference,
      compiler,
      executor,
      parser,
      consumption,
      clock,
      projectBalance
    );
  });

  it('resolves a SQL main source through its escaped stable view without compiling raw SQL', async () => {
    dataMart.definition = { sqlQuery: 'SELECT current_value FROM changed_source' } as never;
    dataMartRun.definitionRun = { sqlQuery: 'SELECT saved_value FROM saved_source' };
    dataMartRun.dataQualitySnapshot!.definitionType = DataMartDefinitionType.SQL;
    snapshotTableReference.resolve.mockResolvedValue(
      projectedSnapshotReference('`project`.`internal`.`dq_run_source`')
    );

    await service.executeExistingRun('run-1', 'project-1');

    expect(snapshotTableReference.resolve).toHaveBeenCalledWith({
      dataMartId: 'dm-1',
      projectId: 'project-1',
      definition: { sqlQuery: 'SELECT saved_value FROM saved_source' },
      storage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
      liveStorage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
    });
    expect(compiler.compile).toHaveBeenCalledWith(
      expect.objectContaining({ resolveSourceQuery: expect.any(Function) })
    );
    const resolveSourceQuery = compiler.compile.mock.calls[0][0].resolveSourceQuery;
    await expect(resolveSourceQuery?.(['`id`'])).resolves.toBe(
      'SELECT `id` FROM `project`.`internal`.`dq_run_source`'
    );
    expect(JSON.stringify(compiler.compile.mock.calls)).not.toContain('changed_source');
    expect(JSON.stringify(compiler.compile.mock.calls)).not.toContain('saved_source');
  });

  it('keeps TABLE main sources on the existing query-builder path', async () => {
    await service.executeExistingRun('run-1', 'project-1');

    expect(snapshotTableReference.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: dataMartRun.definitionRun,
        storage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
      })
    );
  });

  it('executes and stores real compiler SQL backed by main and relationship stable views', async () => {
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
      definition: { sqlQuery: 'SELECT current_target_value FROM changed_target' },
      schema: { ...targetSchema, fields: [{ ...targetSchema.fields[0], name: 'current_only' }] },
      storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
    } as unknown as DataMart;
    dataMart.definition = { sqlQuery: 'SELECT current_source_value FROM changed_source' } as never;
    dataMartRun.definitionRun = { sqlQuery: 'SELECT saved_source_value FROM saved_source' };
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
    dataMartRun.dataQualitySnapshot!.relationshipTargets = [
      {
        relationshipId: 'rel-1',
        targetDataMartId: 'dm-2',
        definition: { sqlQuery: 'SELECT saved_target_value FROM saved_target' },
        schema: targetSchema as never,
        storage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
      },
    ];
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    repositories.get(DataMart)!.find.mockResolvedValue([target] as never);
    snapshotTableReference.resolve.mockImplementation(async input =>
      input.dataMartId === 'dm-1'
        ? projectedSnapshotReference('`project`.`internal`.`dq_run_source`')
        : projectedSnapshotReference('`project`.`internal`.`dq_run_target`')
    );
    const realCompiler = createDataQualityCheckCompiler();
    const realParser = createDataQualityResultParser();
    const emittedSql: string[] = [];
    compiler.compile.mockImplementation(input => realCompiler.compile(input));
    parser.parse.mockImplementation((storageType, check, execution) =>
      realParser.parse(storageType, check, execution)
    );
    executor.executeChecks.mockImplementation(async function* (_dataMart, checks) {
      for (const check of checks) {
        if (check.kind === 'NOT_APPLICABLE') {
          yield { check, execution: null };
          continue;
        }
        emittedSql.push(check.sql);
        yield {
          check,
          execution: {
            sql: check.sql,
            rows: [
              {
                violation_count: 0,
                is_applicable: 1,
                example_available: null,
              },
            ],
          },
        };
      }
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.dataQualityResults).toHaveLength(2);
    expect(emittedSql).toHaveLength(2);
    expect(emittedSql[0]).toContain('SELECT `source_pk` FROM `project`.`internal`.`dq_run_source`');
    expect(emittedSql[1]).toContain(
      'SELECT `customer_id`, `source_pk` FROM `project`.`internal`.`dq_run_source`'
    );
    expect(emittedSql[1]).toContain('SELECT `id` FROM `project`.`internal`.`dq_run_target`');
    expect(emittedSql.join('\n')).not.toContain('SELECT *');

    const mainResult = dataMartRun.dataQualityResults?.find(
      result => result.ruleKey === mainRule.key
    );
    const relationshipResult = dataMartRun.dataQualityResults?.find(
      result => result.ruleKey === relationshipRule.key
    );
    expect(mainResult).toMatchObject({
      status: DataQualityCheckStatus.PASSED,
      sql: expect.stringContaining('`project`.`internal`.`dq_run_source`'),
    });
    expect(relationshipResult).toMatchObject({
      status: DataQualityCheckStatus.PASSED,
      sql: expect.stringContaining('`project`.`internal`.`dq_run_target`'),
    });
    const allSql = JSON.stringify({ emittedSql, results: dataMartRun.dataQualityResults });
    expect(allSql).not.toContain('changed_source');
    expect(allSql).not.toContain('changed_target');
    expect(snapshotTableReference.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        dataMartId: 'dm-2',
        definition: { sqlQuery: 'SELECT saved_target_value FROM saved_target' },
        storage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
      })
    );
  });

  it('resumes with saved schemas and resolves one stable target view per relationship', async () => {
    const target = {
      id: 'dm-2',
      projectId: 'project-1',
      definition: { sqlQuery: 'SELECT changed_target FROM current_target' },
      schema: { fields: [{ name: 'current_only' }] },
      storage: { id: 'storage-2', type: DataStorageType.GOOGLE_BIGQUERY },
    } as unknown as DataMart;
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    dataMart.definition = { sqlQuery: 'SELECT changed_source FROM current_source' } as never;
    dataMartRun.definitionRun = { sqlQuery: 'SELECT saved_source FROM queued_source' };
    dataMartRun.dataQualitySnapshot!.definitionType = DataMartDefinitionType.SQL;
    dataMartRun.dataQualitySnapshot!.config.rules = [
      'relationship-forward',
      'relationship-reverse',
    ].map(key => ({
      ...rule(key),
      scope: { type: DataQualityScope.RELATIONSHIP as const, relationshipId: 'rel-1' },
    }));
    dataMartRun.dataQualitySnapshot!.relationships = [
      {
        id: 'rel-1',
        sourceDataMartId: 'dm-1',
        targetDataMartId: 'dm-2',
        targetAlias: 'target',
        joinConditions: [],
      },
    ];
    dataMartRun.dataQualitySnapshot!.relationshipTargets = [
      {
        relationshipId: 'rel-1',
        targetDataMartId: 'dm-2',
        definition: { sqlQuery: 'SELECT saved_target FROM queued_target' },
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'saved_only',
              type: BigQueryFieldType.STRING,
              mode: BigQueryFieldMode.NULLABLE,
              status: DataMartSchemaFieldStatus.CONNECTED,
              isPrimaryKey: false,
              isHiddenForReporting: false,
            },
          ],
        },
        storage: {
          id: 'storage-2',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
      },
    ];
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    repositories.get(DataMart)!.find.mockResolvedValue([target] as never);
    snapshotTableReference.resolve.mockImplementation(async input =>
      input.dataMartId === 'dm-1'
        ? projectedSnapshotReference('`project`.`internal`.`dq_run_source`')
        : projectedSnapshotReference('`project`.`internal`.`dq_run_target`')
    );
    compiler.compile.mockImplementation(async input => {
      const relationship = input.relationship as
        | { resolveTargetSourceQuery?: (columns: string[]) => Promise<unknown> }
        | undefined;
      await relationship?.resolveTargetSourceQuery?.(['`id`']);
      return plan(input.rule.key);
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(snapshotTableReference.resolve).toHaveBeenCalledTimes(2);
    expect(snapshotTableReference.resolve).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        definition: { sqlQuery: 'SELECT saved_source FROM queued_source' },
      })
    );
    expect(snapshotTableReference.resolve).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        dataMartId: 'dm-2',
        definition: { sqlQuery: 'SELECT saved_target FROM queued_target' },
      })
    );
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
    dataMartRun.dataQualitySnapshot!.relationshipTargets = [
      {
        relationshipId: 'rel-1',
        targetDataMartId: 'dm-2',
        definition: { sqlQuery: 'SELECT id FROM raw_target' },
        schema: target.schema as never,
        storage: {
          id: 'storage-1',
          type: DataStorageType.SNOWFLAKE,
        },
      },
    ];
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    repositories.get(DataMart)!.find.mockResolvedValue([target] as never);
    const realCompiler = createDataQualityCheckCompiler();
    const realParser = createDataQualityResultParser();
    compiler.compile.mockImplementation(input => realCompiler.compile(input));
    parser.parse.mockImplementation(async (_storage, check, execution) =>
      check.kind === 'NOT_APPLICABLE'
        ? realParser.parse(DataStorageType.GOOGLE_BIGQUERY, check, execution)
        : parsed(check.ruleKey)
    );

    await service.executeExistingRun('run-1', 'project-1');

    expect(snapshotTableReference.resolve).toHaveBeenCalledTimes(1);
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
    dataMartRun.dataQualitySnapshot!.relationshipTargets = [
      {
        relationshipId: 'rel-1',
        targetDataMartId: 'dm-2',
        definition: { sqlQuery: 'SELECT target_secret FROM raw_target' },
        schema: target.schema as never,
        storage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
      },
    ];
    const providerError = Object.assign(new Error(sensitiveMarker), {
      code: 'BQ_VIEW_REFRESH_FAILED',
      reason: 'invalidQuery',
    });
    snapshotTableReference.resolve.mockImplementation(async input => {
      if (input.dataMartId === 'dm-2') {
        throw providerError;
      }
      return snapshotReference('SELECT * FROM source');
    });
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
        description: 'Failed to resolve Data Quality source query',
        error: {
          code: 'BQ_VIEW_REFRESH_FAILED',
          message: 'Failed to resolve Data Quality source query',
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
    expect(dataMartRun.errors).toEqual(['Data Quality run failed during execution']);
    expect(JSON.stringify(dataMartRun.dataQualityResults)).not.toContain(sensitiveMarker);
    expect(capturedBoundaryError).toMatchObject({
      message: 'Failed to resolve Data Quality source query',
      code: 'BQ_VIEW_REFRESH_FAILED',
      reason: 'invalidQuery',
      cause: providerError,
    });
  });

  it('stores ERROR results and terminalizes when the main SQL view cannot be resolved', async () => {
    dataMart.definition = { sqlQuery: 'SELECT secret FROM raw_source' } as never;
    dataMartRun.definitionRun = dataMart.definition;
    dataMartRun.dataQualitySnapshot!.definitionType = DataMartDefinitionType.SQL;
    const sensitiveMarker = 'CREATE VIEW hidden AS SELECT secret FROM raw_source';
    snapshotTableReference.resolve.mockRejectedValue(
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
          message: 'Failed to resolve Data Quality source query',
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
    expect(dataMartRun.errors).toEqual(['Data Quality run failed during execution']);
  });

  it('persists safe ERROR results without executing SQL when the source storage moved', async () => {
    dataMart.storage.id = 'storage-moved';
    snapshotTableReference.resolve.mockImplementation(async input => {
      expect(input).toMatchObject({
        storage: { id: 'storage-1' },
        liveStorage: { id: 'storage-moved' },
      });
      throw new DataQualitySnapshotStorageMismatchError();
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(compiler.compile).not.toHaveBeenCalled();
    expect(executor.executeChecks).not.toHaveBeenCalled();
    expect(dataMartRun.dataQualityResults).toEqual([
      expect.objectContaining({
        ruleKey: 'empty-1',
        status: DataQualityCheckStatus.ERROR,
        description: 'Data Storage changed after the run was queued',
        error: expect.objectContaining({
          code: 'DATA_QUALITY_EXECUTION_ERROR',
          message: 'Data Storage changed after the run was queued',
        }),
      }),
    ]);
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
    expect(dataMartRun.errors).toEqual(['Data Quality run failed during execution']);
  });

  it.each([
    ['moved', { id: 'storage-moved', type: DataStorageType.GOOGLE_BIGQUERY }],
    ['deleted', null],
  ])(
    'fails only the affected relationship when its target storage was %s after enqueue',
    async (_caseName, liveStorage) => {
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
      dataMartRun.dataQualitySnapshot!.relationshipTargets = [
        {
          relationshipId: 'rel-1',
          targetDataMartId: 'dm-2',
          definition: { sqlQuery: 'SELECT id FROM saved_target' },
          schema: targetSchema as never,
          storage: {
            id: 'storage-1',
            type: DataStorageType.GOOGLE_BIGQUERY,
          },
        },
      ];
      dataMartRun.dataQualitySummary!.enabledChecks = 2;
      repositories.get(DataMart)!.find.mockResolvedValue(
        liveStorage
          ? ([
              {
                id: 'dm-2',
                projectId: 'project-1',
                definition: { sqlQuery: 'SELECT current_value FROM changed_target' },
                schema: { fields: [] },
                storage: liveStorage,
              },
            ] as never)
          : []
      );
      snapshotTableReference.resolve.mockImplementation(async input => {
        if (input.dataMartId === 'dm-1') {
          return snapshotReference('SELECT * FROM source');
        }
        expect(input.definition).toEqual({ sqlQuery: 'SELECT id FROM saved_target' });
        expect(input.liveStorage).toEqual(liveStorage);
        throw new DataQualitySnapshotStorageMismatchError();
      });
      const realCompiler = createDataQualityCheckCompiler();
      compiler.compile.mockImplementation(input => realCompiler.compile(input));
      parser.parse.mockImplementation(async (_storage, check) => parsed(check.ruleKey));

      await service.executeExistingRun('run-1', 'project-1');

      expect(dataMartRun.dataQualityResults).toEqual([
        expect.objectContaining({
          ruleKey: relationshipRule.key,
          status: DataQualityCheckStatus.ERROR,
          description: 'Data Storage changed after the run was queued',
          error: expect.objectContaining({
            code: 'DATA_QUALITY_EXECUTION_ERROR',
          }),
        }),
        expect.objectContaining({
          ruleKey: independentRule.key,
          status: DataQualityCheckStatus.PASSED,
        }),
      ]);
      expect(dataMartRun.dataQualitySummary).toMatchObject({
        state: DataQualitySummaryState.EXECUTION_FAILED,
        errorChecks: 1,
        passedChecks: 1,
      });
    }
  );

  it('stores ERROR results and terminalizes when the run definition snapshot is unavailable', async () => {
    dataMartRun.definitionRun = null;

    await service.executeExistingRun('run-1', 'project-1');

    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
    expect(snapshotTableReference.resolve).not.toHaveBeenCalled();
    expect(compiler.compile).not.toHaveBeenCalled();
    expect(executor.executeChecks).not.toHaveBeenCalled();
    expect(dataMartRun.dataQualityResults).toEqual([
      expect.objectContaining({
        ruleKey: 'empty-1',
        status: DataQualityCheckStatus.ERROR,
        error: expect.objectContaining({
          code: 'DATA_QUALITY_EXECUTION_ERROR',
          message: 'Data Quality definition snapshot for run run-1 was not found',
        }),
      }),
    ]);
    expect(dataMartRun.dataQualitySummary?.state).toBe(DataQualitySummaryState.EXECUTION_FAILED);
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
    expect(dataMartRun.errors).toEqual(['Data Quality run failed during execution']);
    expect(JSON.stringify(dataMartRun.errors)).not.toContain('run-1');
  });

  it('persists each result, finishes findings as SUCCESS/ISSUES, and publishes once', async () => {
    parser.parse.mockResolvedValue(parsed('empty-1', DataQualityCheckStatus.FAILED));

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
    expect(dataMartRun.startedAt).toEqual(startedAt);
    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledWith(dataMart, 'run-1');
    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledTimes(1);
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
    expect(runQueryBuilder.select).toHaveBeenCalledWith([
      'run.id',
      'run.status',
      'run.dataQualitySummary',
      'run.finishedAt',
    ]);
  });

  it('explicitly loads the hidden snapshot and existing results when resuming a run', async () => {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    dataMartRun.dataQualitySummary!.state = DataQualitySummaryState.RUNNING;
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
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

  it('finishes a fully persisted resumed run without rechecking project balance', async () => {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    dataMartRun.dataQualityResults = [stored('empty-1')];

    await service.executeExistingRun('run-1', 'project-1');

    expect(projectBalance.verifyCanPerformOperations).not.toHaveBeenCalled();
    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
  });

  it('marks the run as restricted without rule errors when project balance blocks operations', async () => {
    projectBalance.verifyCanPerformOperations.mockRejectedValue(
      new ProjectOperationBlockedException([ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED])
    );

    await service.executeExistingRun('run-1', 'project-1');

    expect(projectBalance.verifyCanPerformOperations).toHaveBeenCalledWith('project-1');
    expect(snapshotTableReference.resolve).not.toHaveBeenCalled();
    expect(compiler.compile).not.toHaveBeenCalled();
    expect(executor.executeChecks).not.toHaveBeenCalled();
    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
    expect(dataMartRun).toMatchObject({
      status: DataMartRunStatus.RESTRICTED,
      dataQualitySummary: expect.objectContaining({ state: DataQualitySummaryState.RESTRICTED }),
      dataQualityResults: [],
      errors: [expect.stringContaining('credit limit')],
      finishedAt,
    });
  });

  it('publishes consumption only after final SUCCESS is persisted', async () => {
    let releasePublication!: () => void;
    const publication = new Promise<void>(resolve => {
      releasePublication = resolve;
    });
    let publicationStarted!: () => void;
    const started = new Promise<void>(resolve => {
      publicationStarted = resolve;
    });
    let statusAtPublication: DataMartRunStatus | undefined;
    let checksStartedAtPublication = false;
    consumption.registerDataQualityRunConsumption.mockImplementation(async () => {
      statusAtPublication = dataMartRun.status;
      checksStartedAtPublication = executor.executeChecks.mock.calls.length > 0;
      publicationStarted();
      await publication;
    });

    const execution = service.executeExistingRun('run-1', 'project-1');
    await started;

    releasePublication();
    await execution;

    expect(statusAtPublication).toBe(DataMartRunStatus.SUCCESS);
    expect(checksStartedAtPublication).toBe(true);
  });

  it('keeps the persisted SUCCESS when consumption publication fails', async () => {
    consumption.registerDataQualityRunConsumption.mockRejectedValue(
      new Error('pubsub unavailable')
    );

    await service.executeExistingRun('run-1', 'project-1');

    expect(executor.executeChecks).toHaveBeenCalled();
    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
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
    expect(dataMartRun.errors).toEqual(['Data Quality run failed during execution']);
    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
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
      sql: 'SELECT one unified result',
      error: expect.objectContaining({ code: 'DATA_QUALITY_EXECUTION_ERROR' }),
    });
    expect(dataMartRun.status).toBe(DataMartRunStatus.FAILED);
    expect(dataMartRun.dataQualitySummary).toMatchObject({ errorChecks: 1, passedChecks: 1 });
  });

  it('skips an existing embedded rule key when resuming a durable RUNNING run', async () => {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = startedAt;
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    dataMartRun.dataQualityResults = [stored('empty-1')];
    compiler.compile.mockResolvedValue(plan('empty-2'));
    parser.parse.mockResolvedValue(parsed('empty-2'));

    await service.executeExistingRun('run-1', 'project-1');

    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledWith(dataMart, 'run-1');
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
      yield { check: checks[0], execution: null };
      sequence.push(
        dataMartRun.dataQualityResults?.some(result => result.ruleKey === checks[0].ruleKey)
          ? `stored:${checks[0].ruleKey}`
          : `missing:${checks[0].ruleKey}`
      );
      sequence.push(`query:${checks[1].ruleKey}`);
      yield { check: checks[1], execution: null };
    });
    parser.parse.mockImplementation(async (_storage, check) => parsed(check.ruleKey));

    await service.executeExistingRun('run-1', 'project-1');

    expect(sequence).toEqual(['query:empty-1', 'stored:empty-1', 'query:empty-2']);
  });

  it('upserts duplicate persistence for the same rule key instead of appending twice', async () => {
    executor.executeChecks.mockImplementation(async function* (_dataMart, checks) {
      yield { check: checks[0], execution: null };
      yield { check: checks[0], execution: null };
    });

    await service.executeExistingRun('run-1', 'project-1');

    expect(dataMartRun.dataQualityResults).toHaveLength(1);
    expect(dataMartRun.dataQualityResults?.[0].ruleKey).toBe('empty-1');
    expect(dataMartRun.dataQualitySummary?.totalChecks).toBe(1);
  });

  it.each([
    DataMartRunStatus.SUCCESS,
    DataMartRunStatus.FAILED,
    DataMartRunStatus.CANCELLED,
    DataMartRunStatus.RESTRICTED,
  ])('does not execute an already terminal %s run', async status => {
    dataMartRun.status = status;

    await service.executeExistingRun('run-1', 'project-1');

    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
    expect(snapshotTableReference.resolve).not.toHaveBeenCalled();
    expect(compiler.compile).not.toHaveBeenCalled();
    expect(executor.executeChecks).not.toHaveBeenCalled();
  });

  it.each([
    [DataMartRunStatus.SUCCESS, DataQualitySummaryState.PASSED, []],
    [
      DataMartRunStatus.FAILED,
      DataQualitySummaryState.EXECUTION_FAILED,
      ['Data Quality run failed during execution'],
    ],
    [
      DataMartRunStatus.RESTRICTED,
      DataQualitySummaryState.RESTRICTED,
      ['Project operations are restricted'],
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
      expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
    }
  );

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

  it('preserves a completed embedded check when cooperative cancellation stops the next check', async () => {
    const abortController = new AbortController();
    dataMartRun.dataQualitySnapshot!.config.rules.push(rule('empty-2'));
    dataMartRun.dataQualitySummary!.enabledChecks = 2;
    compiler.compile.mockResolvedValueOnce(plan('empty-1')).mockResolvedValueOnce(plan('empty-2'));
    executor.executeChecks.mockImplementation(async function* (_dataMart, checks) {
      abortController.abort();
      yield { check: checks[0], execution: null };
      abortController.signal.throwIfAborted();
      yield { check: checks[1], execution: null };
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
    expect(consumption.registerDataQualityRunConsumption).not.toHaveBeenCalled();
  });

  it('completes successfully when all checks finish before the cancellation signal arrives', async () => {
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

    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
    expect(dataMartRun.dataQualitySummary?.state).toBe(DataQualitySummaryState.PASSED);
    expect(dataMartRun.dataQualityResults).toEqual([
      expect.objectContaining({ ruleKey: 'empty-1', status: DataQualityCheckStatus.PASSED }),
    ]);
    expect(consumption.registerDataQualityRunConsumption).toHaveBeenCalledWith(dataMart, 'run-1');
  });
});
