jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

jest.mock('../report-run-logging/log-blended-sql', () => ({
  logBlendedSqlIfNeeded: jest.fn(),
}));

import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BigQueryQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-query.builder';
import { BigQueryClauseRenderer } from '../data-storage-types/bigquery/services/bigquery-clause-renderer';
import { BigQueryBlendedQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-blended-query-builder';
import { BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { BigQueryReportHeadersGenerator } from '../data-storage-types/bigquery/services/bigquery-report-headers-generator.service';
import { resolveReportDataHeaders } from '../data-storage-types/utils/report-data-headers.utils';
import {
  DataStorageReportReader,
  PrepareReportDataOptions,
} from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportLike } from '../dto/domain/report-like-read-plan';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ReportExecutionPolicyResolver } from './report-execution-policy.resolver';
import { RunReportService } from './run-report.service';
import { RunType } from '../../common/scheduler/shared/types';
import { ReportRun } from '../models/report-run.model';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { ReportTotalsService } from '../services/report-totals.service';
import { DataMartMapper } from '../mappers/data-mart.mapper';

jest.mock('../data-destination-types/data-destination-providers', () => ({
  DATA_DESTINATION_REPORT_WRITER_RESOLVER: 'DATA_DESTINATION_REPORT_WRITER_RESOLVER',
}));

jest.mock('../data-storage-types/data-storage-providers', () => ({
  DATA_STORAGE_REPORT_READER_RESOLVER: 'DATA_STORAGE_REPORT_READER_RESOLVER',
}));

/**
 * Service-level end-to-end test for an AGGREGATED report run. It wires the REAL
 * compose → read → totals → mapper seam:
 *   RunReportService.executeReport
 *     → ReportSqlComposerService.compose / .composeTotals  (real, real BigQuery builder)
 *     → fake DWH reader                                    (canned rows, real headers)
 *     → ReportTotalsService.computeTotals                  (real)
 *     → dataMartRun.additionalParams.totals
 *     → DataMartMapper.toRunResponse                       (real)  → top-level `totals`
 *
 * Only the warehouse boundary is faked: the reader executes no real SQL — it returns
 * canned rows for the main query and a canned single grand-total row for the totals
 * query. Headers come from the SAME real `resolveReportDataHeaders` the production
 * readers use, so the "<col> | SUM" labels and the date-bucket dimension
 * are produced by real code, not hand-typed. No warehouse credentials are required;
 * the warehouse-level run+aggregation is covered by credential-gated integration specs.
 */
describe('Run report end-to-end: aggregation produces aggregated columns + top-level Totals', () => {
  const headersGenerator = new BigQueryReportHeadersGenerator();

  /**
   * A faithful stand-in for a BigQuery report reader. Headers are resolved through the
   * REAL header pipeline (schema → generateHeaders → resolveReportDataHeaders), exercising
   * the aggregation/date-bucket header naming. The row payload is the only thing canned:
   * the main query yields `mainRows`; the metrics-only totals query (signalled by
   * `rowCount: false` + a non-empty `aggregationConfig`) yields a single `totalsRow`.
   */
  class FakeBigQueryReader implements DataStorageReportReader {
    readonly type = DataStorageType.GOOGLE_BIGQUERY;
    private headers: ReturnType<typeof resolveReportDataHeaders> = [];
    private isTotalsQuery = false;
    readonly capturedOptions: PrepareReportDataOptions[] = [];

    constructor(
      private readonly mainRows: unknown[][],
      private readonly totalsRow: unknown[]
    ) {}

    async prepareReportData(
      report: ReportLike,
      options?: PrepareReportDataOptions
    ): Promise<ReportDataDescription> {
      this.capturedOptions.push(options ?? {});
      const nativeHeaders = headersGenerator.generateHeaders(report.dataMart.schema!);
      this.headers = resolveReportDataHeaders(nativeHeaders, options, this.type);
      // The totals query is the metrics-only one: explicit rowCount:false with aggregations.
      this.isTotalsQuery =
        options?.rowCount === false && (options?.aggregationConfig?.length ?? 0) > 0;
      return new ReportDataDescription(this.headers);
    }

    async readReportDataBatch(): Promise<ReportDataBatch> {
      if (this.isTotalsQuery) {
        return new ReportDataBatch([this.totalsRow], null);
      }
      return new ReportDataBatch(this.mainRows, null);
    }

    async finalize(): Promise<void> {}
    getState() {
      return null;
    }
    async initFromState(): Promise<void> {}

    lastHeaders(): string[] {
      return this.headers.map(h => h.name);
    }
  }

  const createService = (
    options: {
      // Joined numeric fields the blendable schema should report; when provided, the
      // composer routes the totals query through the REAL blended builder.
      blendedFields?: BlendedFieldDto[];
      mainRows?: unknown[][];
      totalsRow?: unknown[];
    } = {}
  ) => {
    // Real composer behind a stub facade that delegates to the real BigQuery builder,
    // so aggregation + date-trunc SQL is produced by production code.
    const realBuilder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());
    const queryBuilderFacade = {
      buildQuery: jest.fn(
        (
          _type: unknown,
          definition: Parameters<BigQueryQueryBuilder['buildQuery']>[0],
          builderOptions: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
        ) => realBuilder.buildQuery(definition, builderOptions)
      ),
    };

    // For a blended report selecting a JOINED numeric column, resolveBlendingDecision must
    // return real blended SQL — built by the REAL BigQuery blended builder — so the totals
    // query travels the production blended path. For the plain main-DM case the decision just
    // echoes the selected columns and the composer builds native SQL.
    const realBlendedBuilder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());
    const blendedReportDataService = {
      resolveBlendingDecision: jest.fn(async (plan: ReportLike) => {
        const columnConfig = ('columnConfig' in plan && plan.columnConfig) || [];
        const joined = (options.blendedFields ?? []).filter(f => columnConfig.includes(f.name));
        if (joined.length === 0) {
          return {
            needsBlending: false,
            columnFilter: columnConfig.length > 0 ? columnConfig : undefined,
          };
        }
        const built = realBlendedBuilder.buildBlendedQuery({
          mainTableReference: 'p.d.main',
          mainDataMartTitle: 'Main',
          mainDataMartUrl: 'http://x',
          chains: [
            {
              relationship: {
                id: 'rel-1',
                joinConditions: [{ sourceFieldName: 'partner_id', targetFieldName: 'id' }],
              } as never,
              targetTableReference: 'p.d.partner',
              parentAlias: 'main',
              cteName: 'partner',
              blendedFields: joined.map(f => ({
                targetFieldName: f.originalFieldName,
                outputAlias: f.name,
                isHidden: false,
                aggregateFunction: f.aggregateFunction,
              })),
              targetDataMartTitle: 'Partner',
              targetDataMartUrl: 'http://y',
            },
          ],
          columns: columnConfig,
          aggregations: ('aggregationConfig' in plan && plan.aggregationConfig) || undefined,
          rowCount: false,
          columnTypes: {
            postJoin: new Map((options.blendedFields ?? []).map(f => [f.name, f.type])),
          },
        });
        return { needsBlending: true, blendedSql: built.sql, params: built.params };
      }),
    };
    const tableReferenceService = { resolveTableName: jest.fn().mockResolvedValue('p.d.t') };
    const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
    const blendableSchemaService = {
      computeBlendableSchema: jest
        .fn()
        .mockResolvedValue({ nativeFields: [], blendedFields: options.blendedFields ?? [] }),
    };
    const reportSqlComposerService = new ReportSqlComposerService(
      blendedReportDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
      blendableSchemaService as never
    );

    // The fake reader is shared by the main run AND the fresh totals reader (the resolver
    // returns the same instance both times, mirroring one storage type → one reader kind).
    const reader = new FakeBigQueryReader(
      options.mainRows ?? [
        ['2026-01-01', 'paid', 100, 5],
        ['2026-02-01', 'paid', 250, 9],
      ],
      // Totals grand-total row: SUM/AVG/MIN/MAX(revenue), SUM/AVG/MIN/MAX(quantity)
      options.totalsRow ?? [350, 175, 100, 250, 14, 7, 5, 9]
    );
    const reportReaderResolver = { resolve: jest.fn().mockResolvedValue(reader) };

    // Real totals service over the real composer + the fake reader.
    const reportTotalsService = new ReportTotalsService(
      reportReaderResolver as never,
      reportSqlComposerService
    );

    const writer = {
      type: DataDestinationType.GOOGLE_SHEETS,
      setExecutionContext: jest.fn(),
      prepareToWriteReport: jest.fn().mockResolvedValue(undefined),
      writeReportDataBatch: jest.fn().mockResolvedValue(undefined),
      finalize: jest.fn().mockResolvedValue(undefined),
    };
    const reportWriterResolver = { resolve: jest.fn().mockResolvedValue(writer) };

    const dataMartService = {
      actualizeSchemaInEntity: jest.fn().mockResolvedValue(undefined),
      saveActualizedSchema: jest.fn().mockResolvedValue(undefined),
    };
    const reportRunService = {
      loadByDataMartRunId: jest.fn(),
      markAsStarted: jest.fn().mockResolvedValue(undefined),
      finish: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RunReportService(
      reportReaderResolver as never,
      reportWriterResolver as never,
      dataMartService as never,
      {
        isInShutdownMode: jest.fn().mockReturnValue(false),
        registerActiveProcess: jest.fn(),
        unregisterActiveProcess: jest.fn(),
      } as never,
      { now: jest.fn().mockReturnValue(new Date('2026-06-29T10:00:00.000Z')) } as never,
      reportRunService as never,
      { verifyIsAllowed: jest.fn() } as never,
      { verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined) } as never,
      new ReportExecutionPolicyResolver(),
      { createTrigger: jest.fn() } as never,
      { checkOperateAccess: jest.fn().mockResolvedValue(undefined) } as never,
      blendedReportDataService as never,
      reportSqlComposerService,
      { getProjectMemberOrThrow: jest.fn().mockResolvedValue({ role: 'admin' }) } as never,
      {
        registerSheetsReportRunConsumption: jest.fn().mockResolvedValue(undefined),
        registerEmailBasedReportRunConsumption: jest.fn().mockResolvedValue(undefined),
      } as never,
      reportTotalsService
    );

    // Real mapper for the response-shape assertion.
    const mapper = new DataMartMapper({} as never, {} as never);

    return { service, reader, writer, reportRunService, mapper };
  };

  /**
   * Aggregated report: SUM/AVG on `revenue` and `quantity`, bucketed by month on
   * `order_date`. Schema fields carry the real BigQuery types so governance derives the
   * numeric type-default (SUM/AVG/MIN/MAX) for totals.
   */
  const createAggregatedReport = (): Report => {
    const report = new Report();
    report.id = 'report-agg-1';
    report.title = 'Monthly revenue';
    report.createdById = 'user-1';
    report.columnConfig = ['order_date', 'channel', 'revenue', 'quantity'];
    report.aggregationConfig = [
      { column: 'revenue', function: 'SUM' },
      { column: 'quantity', function: 'AVG' },
    ];
    report.dateTruncConfig = [{ column: 'order_date', unit: 'MONTH' }];
    report.dataMart = {
      id: 'data-mart-1',
      projectId: 'project-1',
      definitionType: 'TABLE',
      definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
      storage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
        config: { projectId: 'p' },
      },
      schema: {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'order_date',
            type: 'DATE',
            mode: 'NULLABLE',
            status: 'CONNECTED',
            isPrimaryKey: false,
          },
          {
            name: 'channel',
            type: 'STRING',
            mode: 'NULLABLE',
            status: 'CONNECTED',
            isPrimaryKey: false,
          },
          {
            name: 'revenue',
            type: 'INTEGER',
            mode: 'NULLABLE',
            status: 'CONNECTED',
            isPrimaryKey: false,
          },
          {
            name: 'quantity',
            type: 'INTEGER',
            mode: 'NULLABLE',
            status: 'CONNECTED',
            isPrimaryKey: false,
          },
        ],
      },
    } as never;
    const dataDestination = new DataDestination();
    // Totals are computed only for totals-consuming destinations (push destinations like
    // Google Sheets / Email skip the extra scan). Use Looker Studio so the totals
    // computation + run-response contract below are exercised.
    dataDestination.type = DataDestinationType.LOOKER_STUDIO;
    report.dataDestination = dataDestination;
    return report;
  };

  const createDataMartRun = (report: Report): DataMartRun => {
    const run = new DataMartRun();
    run.id = 'data-mart-run-1';
    run.dataMartId = report.dataMart.id;
    run.reportId = report.id;
    run.status = DataMartRunStatus.PENDING;
    run.type = DataMartRunType.LOOKER_STUDIO;
    run.runType = RunType.manual;
    run.createdById = report.createdById;
    run.definitionRun = {} as never;
    return run;
  };

  it('produces the aggregated output columns (with the date-bucket dimension) for the written rows', async () => {
    const { service, writer } = createService();
    const report = createAggregatedReport();

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] }
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] });

    // The reader's prepared description (what destinations receive) is the main-query header
    // set: the date-bucket dimension keeps its column name, the metrics carry the suffix, and
    // Row Count is auto-appended for an aggregated report.
    const preparedHeaders = (
      writer.prepareToWriteReport.mock.calls[0][1] as ReportDataDescription
    ).dataHeaders.map(h => h.name);
    expect(preparedHeaders).toEqual([
      'order_date',
      'channel',
      'revenue | SUM',
      'quantity | AVG',
      'Row Count',
    ]);
  });

  it('exposes the per-numeric-field Totals at the TOP LEVEL of the run response (not nested in additionalParams)', async () => {
    const { service, reportRunService, mapper } = createService();
    const report = createAggregatedReport();
    const dataMartRun = createDataMartRun(report);
    const reportRun = ReportRun.create(report, dataMartRun);
    reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

    await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

    // The run succeeded and totals were persisted onto the run record under additionalParams.
    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
    const expectedTotals = {
      'revenue | SUM': 350,
      'revenue | AVG': 175,
      'revenue | MIN': 100,
      'revenue | MAX': 250,
      'quantity | SUM': 14,
      'quantity | AVG': 7,
      'quantity | MIN': 5,
      'quantity | MAX': 9,
    };
    expect(dataMartRun.additionalParams).toEqual({ totals: expectedTotals });

    // Map through the REAL mapper exactly as the controller does: totals must surface at the
    // TOP LEVEL of the response, NOT under additionalParams.
    const response = await mapper.toRunResponse(mapper.toDataMartRunDto(dataMartRun));
    expect(response.totals).toEqual(expectedTotals);
    expect(response.additionalParams).toBeNull();
  });

  it('omits totals for a NON-aggregated report (no selected numeric field still leaves rows succeeding)', async () => {
    const { service, reportRunService, mapper } = createService();
    const report = createAggregatedReport();
    // Project only non-numeric columns and drop the aggregation/date-bucket: no numeric field
    // selected → composeTotals returns null → no totals block.
    report.columnConfig = ['order_date', 'channel'];
    report.aggregationConfig = null;
    report.dateTruncConfig = null;
    const dataMartRun = createDataMartRun(report);
    const reportRun = ReportRun.create(report, dataMartRun);
    reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

    await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
    expect(dataMartRun.additionalParams?.totals).toBeUndefined();
    const response = await mapper.toRunResponse(mapper.toDataMartRunDto(dataMartRun));
    expect(response.totals).toBeNull();
  });

  // A joined (blended) numeric field selected on the report. The totals query travels the
  // production blended path (real BigQuery blended builder) and the joined numeric field must
  // appear in the TOP-LEVEL totals — exercising the joined-totals code through the run seam.
  const blendedField = (
    name: string,
    type: string,
    postJoinAggregations?: ReportAggregateFunction[]
  ): BlendedFieldDto => {
    const f = new BlendedFieldDto();
    f.name = name;
    f.sourceRelationshipId = 'rel-1';
    f.sourceDataMartId = 'dm-partner';
    f.sourceDataMartTitle = 'Partner';
    f.targetAlias = 'partner';
    f.originalFieldName = name.replace(/^partner__/, '');
    f.type = type;
    f.alias = '';
    f.description = '';
    f.isHidden = false;
    f.aggregateFunction = 'SUM';
    f.postJoinAggregations = postJoinAggregations;
    f.transitiveDepth = 1;
    f.aliasPath = 'partner';
    f.outputPrefix = 'Partner';
    return f;
  };

  it('includes a JOINED numeric field in the top-level Totals (blended path through the run seam)', async () => {
    // Joined `partner__cost` (post-join allowed set SUM/AVG) alongside main-mart `revenue`.
    // The composed totals plan is `[revenue (SUM/AVG/MIN/MAX), partner__cost (SUM/AVG)]`, so
    // the canned grand-total row carries six values in that exact order.
    const { service, reportRunService, mapper } = createService({
      blendedFields: [blendedField('partner__cost', 'FLOAT', ['SUM', 'AVG'])],
      totalsRow: [350, 175, 100, 250, 99.5, 49.75],
    });
    const report = createAggregatedReport();
    report.columnConfig = ['channel', 'revenue', 'partner__cost'];

    const dataMartRun = createDataMartRun(report);
    const reportRun = ReportRun.create(report, dataMartRun);
    reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

    await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

    expect(dataMartRun.status).toBe(DataMartRunStatus.SUCCESS);
    const response = await mapper.toRunResponse(mapper.toDataMartRunDto(dataMartRun));
    expect(response.totals).toEqual({
      'revenue | SUM': 350,
      'revenue | AVG': 175,
      'revenue | MIN': 100,
      'revenue | MAX': 250,
      'partner__cost | SUM': 99.5,
      'partner__cost | AVG': 49.75,
    });
    expect(response.additionalParams).toBeNull();
  });
});
