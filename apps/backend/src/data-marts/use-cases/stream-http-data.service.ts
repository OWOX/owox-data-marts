import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { AuthorizationContext } from '../../idp/types/auth.types';
import {
  DATA_STORAGE_ERROR_MAPPER_RESOLVER,
  DATA_STORAGE_REPORT_READER_RESOLVER,
} from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageErrorMapper } from '../data-storage-types/interfaces/data-storage-error-mapper.interface';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { CalculatedFieldPlan, SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';
import { columnFilterWithoutCalculatedFields } from '../calculated-fields/calculated-field.utils';
import { ReportLikeReadPlan, hasOutputControls } from '../dto/domain/report-like-read-plan';
import { hasMainUniqueCount } from '../dto/schemas/unique-count-sources';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { StreamHttpDataCommand } from '../dto/domain/stream-http-data.command';
import { StreamHttpReportDataCommand } from '../dto/domain/stream-http-report-data.command';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { Action, EntityType } from '../services/access-decision/access-decision.types';
import { AccessDecisionService } from '../services/access-decision/access-decision.service';
import { BlendedReportDataService } from '../services/blended-report-data.service';
import { DataMartService } from '../services/data-mart.service';
import {
  ProjectBillingService,
  RunKind,
} from '../services/project-billing/project-billing.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { ReportService } from '../services/report.service';
import { ReportTotals, ReportTotalsService } from '../services/report-totals.service';
import { SourceDataLastUpdatedService } from '../services/source-data-last-updated.service';
import { HttpDataColumnResolver } from '../services/http-data/http-data-column-resolver.service';
import { HttpDataColumnValidator } from '../services/http-data/http-data-column-validator.service';
import {
  nativeColumnNames,
  implicitAllNativeColumnNames,
  implicitAllBlendedColumnNames,
  visibleBlendedColumnNames,
  ReportingColumns,
} from '../services/http-data/http-data-column-sets.util';
import { HttpDataRequestValidator } from '../services/http-data/http-data-request-validator.service';
import { HttpDataStreamWriter } from '../services/http-data/http-data-stream-writer.service';
import {
  BlendableSchemaAccessor,
  BlendableSchemaService,
} from '../services/blendable-schema.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import {
  HTTP_DATA_SCHEMA_EXPIRES_AFTER_MS,
  STREAM_BATCH_SIZE,
} from '../services/http-data/http-data.constants';
import {
  HTTP_DATA_FORMAT,
  HttpDataRunMetadata,
} from '../dto/schemas/http-data-run-metadata.schema';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { randomUUID } from 'crypto';

class StreamCancelledError extends Error {
  override readonly name = 'StreamCancelledError';
}

// Discriminates the two executeStream callers instead of a loose bag of co-varying fields
// (projectionColumns: null sentinel, optional reportId/captureExecutionSql).
type ExecuteStreamPlan =
  | { kind: 'data-mart'; readPlan: ReportLikeReadPlan; columns: string[] }
  | { kind: 'report'; readPlan: ReportLikeReadPlan; reportId: string; savedColumns: string[] };

// Exhaustiveness guard: if a 3rd ExecuteStreamPlan kind is ever added, the switch in executeStream
// that doesn't handle it fails to compile here instead of silently falling through at runtime.
function assertNever(value: never): never {
  throw new Error(`Unhandled ExecuteStreamPlan kind: ${JSON.stringify(value)}`);
}

// Per-kind values derived once from the discriminated plan; the rest of executeStream reads these
// locals instead of re-inspecting plan.kind at each usage site.
interface StreamPlanContext {
  metadataColumns: string[];
  reportId: string | undefined;
  captureExecutionSql: boolean;
  projectsByResolvedHeaders: boolean;
}

function deriveStreamPlanContext(plan: ExecuteStreamPlan): StreamPlanContext {
  switch (plan.kind) {
    case 'data-mart':
      return {
        metadataColumns: plan.columns,
        reportId: undefined,
        captureExecutionSql: false,
        projectsByResolvedHeaders: false,
      };
    case 'report':
      return {
        metadataColumns: plan.savedColumns,
        reportId: plan.reportId,
        captureExecutionSql: true,
        projectsByResolvedHeaders: true,
      };
    default:
      return assertNever(plan);
  }
}

@Injectable()
export class StreamHttpDataService {
  private readonly logger = new Logger(StreamHttpDataService.name);

  constructor(
    private readonly requestValidator: HttpDataRequestValidator,
    private readonly columnResolver: HttpDataColumnResolver,
    private readonly columnValidator: HttpDataColumnValidator,
    private readonly streamWriter: HttpDataStreamWriter,
    private readonly dataMartRunService: DataMartRunService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    private readonly projectBillingService: ProjectBillingService,
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly systemTimeService: SystemTimeService,
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    @Inject(DATA_STORAGE_ERROR_MAPPER_RESOLVER)
    private readonly errorMapperResolver: TypeResolver<DataStorageType, DataStorageErrorMapper>,
    private readonly reportTotalsService: ReportTotalsService,
    private readonly reportService: ReportService,
    private readonly sourceDataLastUpdatedService: SourceDataLastUpdatedService
  ) {}

  async stream(command: StreamHttpDataCommand, res: Response): Promise<void> {
    if (this.gracefulShutdownService.isInShutdownMode()) {
      throw new ServiceUnavailableException('Server is shutting down');
    }

    const query = this.requestValidator.validate(command.rawQuery);
    const limit = query.limit;
    const ctx: AuthorizationContext = {
      userId: command.userId,
      projectId: command.projectId,
      roles: command.roles,
    };
    const accessor: BlendableSchemaAccessor = { userId: ctx.userId, roles: ctx.roles ?? [] };

    const dataMart = await this.loadAccessibleDataMart(command.dataMartId, ctx);

    await this.executeStream({
      dataMart,
      accessor,
      userId: ctx.userId,
      res,
      runId: randomUUID(),
      startedAt: this.systemTimeService.now(),
      initialMetadata: {
        format: HTTP_DATA_FORMAT,
        columns: [],
        filter: query.filter,
        sort: query.sort,
        aggregation: query.aggregation,
        dateTrunc: query.dateTrunc,
        limit,
      },
      buildPlan: async currentDataMart => {
        const blendableSchema = await this.blendableSchemaService.computeBlendableSchema(
          currentDataMart.id,
          currentDataMart.projectId,
          accessor
        );
        const reportingColumns: ReportingColumns = {
          native: nativeColumnNames(blendableSchema),
          implicitAllNative: implicitAllNativeColumnNames(blendableSchema),
          blended: visibleBlendedColumnNames(blendableSchema),
          implicitAllBlended: implicitAllBlendedColumnNames(blendableSchema),
        };
        const columns = this.columnResolver.resolve(query.columnSelector, reportingColumns);
        this.columnValidator.validate(
          {
            selectedColumns: columns,
            filter: query.filter,
            sort: query.sort,
            aggregation: query.aggregation,
            dateTrunc: query.dateTrunc,
          },
          reportingColumns
        );

        const readPlan: ReportLikeReadPlan = {
          dataMart: currentDataMart,
          columnConfig: columns,
          filterConfig: query.filter,
          sortConfig: query.sort,
          aggregationConfig: query.aggregation,
          dateTruncConfig: query.dateTrunc,
          limitConfig: limit ?? null,
        };

        return { kind: 'data-mart', readPlan, columns };
      },
    });
  }

  async streamReport(command: StreamHttpReportDataCommand, res: Response): Promise<void> {
    if (this.gracefulShutdownService.isInShutdownMode()) {
      throw new ServiceUnavailableException('Server is shutting down');
    }

    const { limit } = this.requestValidator.validateReportQuery(command.rawQuery);
    const ctx: AuthorizationContext = {
      userId: command.userId,
      projectId: command.projectId,
      roles: command.roles,
    };
    const accessor: BlendableSchemaAccessor = { userId: ctx.userId, roles: ctx.roles ?? [] };

    const report = await this.reportService.getByIdAndProjectId(
      command.reportId,
      command.projectId
    );
    const dataMart = await this.loadAccessibleDataMart(report.dataMart.id, ctx);

    await this.executeStream({
      dataMart,
      accessor,
      userId: ctx.userId,
      res,
      runId: randomUUID(),
      startedAt: this.systemTimeService.now(),
      reportId: report.id,
      initialMetadata: {
        format: HTTP_DATA_FORMAT,
        columns: report.columnConfig ?? [],
        filter: report.filterConfig ?? undefined,
        sort: report.sortConfig ?? undefined,
        aggregation: report.aggregationConfig ?? undefined,
        dateTrunc: report.dateTruncConfig ?? undefined,
        limit: limit ?? report.limitConfig ?? undefined,
      },
      buildPlan: async currentDataMart => {
        // The report's `dataDestination` is deliberately NOT carried into the read plan. Joined-field
        // labels follow the surface that renders them, not the place the report also writes to: this
        // endpoint emits NDJSON, where a `Data Mart name Field name` prefix reads fine, so it keeps
        // the prefix even for a report whose destination is Google Sheets (which suffixes the name to
        // survive a narrow header cell). Forwarding the destination here would make two reports on
        // the same Data Mart, with identical column configs, return different `title`s over this
        // endpoint purely because one of them happens to write to a spreadsheet.
        const readPlan: ReportLikeReadPlan = {
          dataMart: currentDataMart,
          columnConfig: report.columnConfig ?? undefined,
          filterConfig: report.filterConfig ?? undefined,
          sortConfig: report.sortConfig ?? undefined,
          aggregationConfig: report.aggregationConfig ?? undefined,
          dateTruncConfig: report.dateTruncConfig ?? undefined,
          uniqueCountConfig: report.uniqueCountConfig ?? undefined,
          limitConfig: limit ?? report.limitConfig ?? null,
        };

        return {
          kind: 'report',
          readPlan,
          reportId: report.id,
          savedColumns: report.columnConfig ?? [],
        };
      },
    });
  }

  private async executeStream(params: {
    dataMart: DataMart;
    accessor: BlendableSchemaAccessor;
    userId: string;
    res: Response;
    runId: string;
    startedAt: Date;
    initialMetadata: HttpDataRunMetadata;
    reportId?: string;
    buildPlan: (dataMart: DataMart) => Promise<ExecuteStreamPlan>;
  }): Promise<void> {
    const { dataMart, accessor, userId, res, runId, startedAt, initialMetadata, buildPlan } =
      params;

    let reader: DataStorageReportReader | null = null;
    let baseMetadata = initialMetadata;
    let reportId = params.reportId;
    let schemaActualizationInProgress = false;

    try {
      await this.projectBillingService.verifyCanPerformOperations(
        dataMart.projectId,
        RunKind.HTTP_DATA_RUN
      );

      schemaActualizationInProgress = true;
      await this.dataMartService.actualizeSchemaInEntityIfExpired(
        dataMart,
        HTTP_DATA_SCHEMA_EXPIRES_AFTER_MS
      );
      schemaActualizationInProgress = false;

      const plan = await buildPlan(dataMart);
      const { readPlan } = plan;
      const planContext = deriveStreamPlanContext(plan);
      const { metadataColumns, captureExecutionSql, projectsByResolvedHeaders } = planContext;
      reportId = planContext.reportId ?? reportId;

      baseMetadata = {
        format: HTTP_DATA_FORMAT,
        columns: metadataColumns,
        filter: readPlan.filterConfig ?? undefined,
        sort: readPlan.sortConfig ?? undefined,
        aggregation: readPlan.aggregationConfig ?? undefined,
        dateTrunc: readPlan.dateTruncConfig ?? undefined,
        limit: readPlan.limitConfig ?? undefined,
      };

      const decision = await this.blendedReportDataService.resolveBlendingDecision(
        readPlan,
        accessor
      );

      if (decision.needsBlending && !decision.blendedSql) {
        throw new InternalServerErrorException('Blended SQL was not produced for this Data Mart');
      }

      // Data Last Updated rides along with the stream (meeting decision: measure when data is
      // delivered anyway). Never rejects and self-caps at its soft timeout, so it cannot fail
      // the stream — worst case it delays the first byte by up to that cap.
      const dataLastUpdatedPromise = decision.needsBlending
        ? this.sourceDataLastUpdatedService.resolveForSql({
            storage: dataMart.storage,
            sql: decision.blendedSql ?? '',
            params: decision.params,
          })
        : this.sourceDataLastUpdatedService.resolveForDefinition({ dataMart });

      let sqlOverride: string | undefined = decision.blendedSql;
      let sqlOverrideParams = decision.params;
      let calculatedFields: CalculatedFieldPlan[] | undefined = decision.calculatedFields;
      if (!decision.needsBlending && hasOutputControls(readPlan)) {
        const composed = await this.reportSqlComposerService.compose(readPlan, accessor, decision);
        sqlOverride = composed.sql;
        sqlOverrideParams = composed.params;
        calculatedFields = composed.calculatedFields;
      }
      const columnFilter = columnFilterWithoutCalculatedFields(
        decision.columnFilter,
        calculatedFields
      );

      const executionSqlQuery = captureExecutionSql
        ? this.tryInlineExecutedSql(dataMart, sqlOverride, sqlOverrideParams)
        : undefined;

      if (executionSqlQuery) {
        baseMetadata.executionSqlQuery = executionSqlQuery;
      }

      reader = await this.readerResolver.resolve(dataMart.storage.type);
      const description = await reader.prepareReportData(readPlan, {
        sqlOverride,
        sqlOverrideParams,
        columnFilter,
        blendedDataHeaders: decision.blendedDataHeaders,
        aggregationConfig: decision.aggregations ?? readPlan.aggregationConfig ?? undefined,
        uniqueCount: hasMainUniqueCount(readPlan.uniqueCountConfig),
        primaryKeyColumns: decision.primaryKeyColumns,
        uniqueCountSources: decision.uniqueCountSources,
        calculatedFields,
      });

      // Grand totals are a SEPARATE DWH query bridged to the client via x-owox-run-id. Computed
      // BEFORE streamRows: NDJSON headers cannot change once the first chunk is flushed. BEST-EFFORT.
      const { totals, totalsError } = await this.computeTotalsBestEffort(
        readPlan,
        accessor,
        dataMart
      );

      // Journalled into the run metadata regardless of outcome; persisted as the Data Mart's
      // last-known value only when the stream reads exactly this Data Mart's own sources (a
      // blended stream spans several Data Marts and would overstate this one).
      const dataLastUpdated = await dataLastUpdatedPromise;
      baseMetadata.dataLastUpdated = dataLastUpdated;
      if (!decision.needsBlending && dataLastUpdated.dataLastUpdatedAt !== null) {
        try {
          await this.dataMartService.updateDataLastUpdated(
            dataMart.id,
            dataMart.projectId,
            dataLastUpdated
          );
        } catch (persistError) {
          this.logger.warn(
            `Failed to persist data last updated for data mart ${dataMart.id}: ${
              persistError instanceof Error ? persistError.message : String(persistError)
            }`
          );
        }
      }

      // Aggregated reports rename headers to "<column> | <FN>", so project by
      // the resolved header names. A report always projects by resolved headers — correct for both
      // an explicit columnConfig and a null (all-columns) config.
      //
      // A selected calculated field is the same class of case: it IS an aggregate
      // even when `aggregationConfig` itself is empty, so `aggregated` alone is a separate axis
      // from `hasOutputControls`'s own calculated-metric flip above — that one governs
      // header SYNTHESIS, this one governs which column NAMES `streamRows` looks each row value
      // up by. Missing it does not error: `buildFieldIndexMap` looks a name up in `dataHeaders`
      // by NAME, so a name absent from `dataHeaders` resolves to index -1 and streams as a
      // silent `null` — the metric's own name and any header this composition renamed alike.
      const aggregated =
        (readPlan.aggregationConfig?.length ?? 0) > 0 || (calculatedFields?.length ?? 0) > 0;
      const outputColumns =
        projectsByResolvedHeaders || aggregated
          ? description.dataHeaders.map(header => header.name)
          : metadataColumns;

      const { rowCount, bytesWritten } = await this.streamRows(
        res,
        reader,
        description.dataHeaders,
        outputColumns,
        runId
      );

      // F2: an all-columns report has no explicit columnConfig, so the plan's metadata columns are
      // empty; fall back to the resolved header names now that they're known. The data-mart path
      // always has explicit resolved columns, so its recorded columns are left untouched.
      const runColumns =
        projectsByResolvedHeaders && metadataColumns.length === 0
          ? description.dataHeaders.map(h => h.name)
          : metadataColumns;

      await this.recordSuccessfulRun(
        dataMart,
        userId,
        runId,
        startedAt,
        {
          ...baseMetadata,
          columns: runColumns,
          dataDescription: this.toMetadataDataDescription(description.dataHeaders),
          rowCount,
          bytesWritten,
          completed: true,
          ...(totals ? { totals } : {}),
          ...(totalsError ? { totalsError } : {}),
        },
        reportId
      );

      res.end();
    } catch (error) {
      const mappedError = await this.toClientFacingReadError(
        error,
        reader,
        dataMart,
        res,
        schemaActualizationInProgress
      );
      await this.recordFailedRun(
        dataMart,
        userId,
        runId,
        startedAt,
        { ...baseMetadata, completed: false },
        mappedError,
        error instanceof ProjectOperationBlockedException
          ? DataMartRunStatus.RESTRICTED
          : DataMartRunStatus.FAILED,
        reportId
      );
      this.handleStreamFailure(res, mappedError);
    } finally {
      if (reader) await this.safelyFinalizeReader(reader);
    }
  }

  private tryInlineExecutedSql(
    dataMart: DataMart,
    sqlOverride: string | undefined,
    sqlOverrideParams: SqlParameter[] | undefined
  ): string | undefined {
    if (!sqlOverride) {
      return undefined;
    }
    try {
      return this.reportSqlComposerService.inlineStaticSql(
        dataMart.storage.type,
        sqlOverride,
        sqlOverrideParams
      );
    } catch (err) {
      this.logger.warn(
        `Failed to inline executed SQL for HTTP Data run: ${err instanceof Error ? err.message : String(err)}`
      );
      return undefined;
    }
  }

  private async toClientFacingReadError(
    error: unknown,
    reader: DataStorageReportReader | null,
    dataMart: DataMart,
    res: Response,
    forceStorageReadError: boolean
  ): Promise<unknown> {
    if (res.headersSent || error instanceof StreamCancelledError) {
      return error;
    }

    const mapper = await this.errorMapperResolver.resolve(dataMart.storage.type);
    return mapper.toStorageReadError(error, { force: forceStorageReadError || reader !== null });
  }

  /**
   * Totals never cost the run its rows, so a failure degrades to none — but it is RECORDED, not
   * swallowed: an absent totals block is otherwise indistinguishable from a report that has no
   * eligible metric, and the run record is the only place anyone can look afterwards. Logged at
   * error level for the same reason — a whole class of reports losing their totals must be
   * visible in production, not inferred from a missing field.
   */
  private async computeTotalsBestEffort(
    readPlan: ReportLikeReadPlan,
    accessor: BlendableSchemaAccessor,
    dataMart: DataMart
  ): Promise<{ totals: ReportTotals | null; totalsError?: string }> {
    try {
      return {
        totals: await this.reportTotalsService.computeTotals(
          readPlan,
          accessor,
          dataMart.storage.type
        ),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to compute totals for Data Mart ${dataMart.id}: ${reason}`);
      return { totals: null, totalsError: reason };
    }
  }

  private async recordSuccessfulRun(
    dataMart: DataMart,
    createdById: string,
    runId: string,
    startedAt: Date,
    metadata: HttpDataRunMetadata,
    reportId?: string
  ): Promise<void> {
    try {
      await this.dataMartRunService.recordHttpDataRun({
        runId,
        dataMart,
        createdById,
        startedAt,
        status: DataMartRunStatus.SUCCESS,
        metadata,
        reportId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist SUCCESS HTTP Data run ${runId}: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    try {
      await this.projectBillingService.registerHttpDataRunConsumption(dataMart, runId);
    } catch (err) {
      this.logger.warn(
        `Failed to register HTTP Data run consumption ${runId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async recordFailedRun(
    dataMart: DataMart,
    createdById: string,
    runId: string,
    startedAt: Date,
    metadata: HttpDataRunMetadata,
    error: unknown,
    status: DataMartRunStatus.FAILED | DataMartRunStatus.RESTRICTED,
    reportId?: string
  ): Promise<void> {
    const message = this.clientFacingErrorMessage(error);
    try {
      await this.dataMartRunService.recordHttpDataRun({
        runId,
        dataMart,
        createdById,
        startedAt,
        status,
        metadata,
        errors: [message],
        reportId,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist ${status} HTTP Data run ${runId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private clientFacingErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (typeof response === 'object' && response !== null && !Array.isArray(response)) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === 'string' && message.length > 0) return message;
      }
    }

    return error instanceof Error ? error.message : String(error);
  }

  private toMetadataDataDescription(
    dataHeaders: ReportDataHeader[]
  ): HttpDataRunMetadata['dataDescription'] {
    return {
      dataHeaders: dataHeaders.map(header => ({
        name: header.name,
        title: header.alias,
        description: header.description,
        type: header.storageFieldType,
      })),
    };
  }

  private async loadAccessibleDataMart(
    dataMartId: string,
    ctx: AuthorizationContext
  ): Promise<DataMart> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, ctx.projectId);

    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new NotFoundException(`Data Mart ${dataMartId} not found`);
    }

    const allowed = await this.accessDecisionService.canAccess(
      ctx.userId,
      ctx.roles ?? [],
      EntityType.DATA_MART,
      dataMart.id,
      Action.USE,
      ctx.projectId
    );
    if (!allowed) {
      throw new ForbiddenException(`Access to Data Mart ${dataMartId} is not allowed`);
    }

    return dataMart;
  }

  private async streamRows(
    res: Response,
    reader: DataStorageReportReader,
    dataHeaders: ReportDataHeader[],
    requestedColumns: string[],
    runId: string
  ): Promise<{ rowCount: number; bytesWritten: number }> {
    const fieldIndexMap = this.buildFieldIndexMap(dataHeaders, requestedColumns);
    const abortController = new AbortController();
    const onClose = () =>
      abortController.abort(
        new StreamCancelledError('Client disconnected before stream completion')
      );
    const onError = (error: unknown) =>
      abortController.abort(
        error instanceof Error ? error : new StreamCancelledError('Response stream error')
      );
    res.once('close', onClose);
    res.once('error', onError);

    try {
      let rowCount = 0;
      let bytesWritten = 0;
      let headersSent = false;
      let nextBatchId: string | undefined | null = undefined;

      do {
        this.throwIfAborted(abortController.signal);
        if (this.gracefulShutdownService.isInShutdownMode()) {
          throw new StreamCancelledError('Server entered shutdown mode during stream');
        }
        const batch = await this.readBatchOrAbort(reader, nextBatchId, abortController.signal);

        if (!headersSent) {
          this.streamWriter.initHeaders(res, { runId });
          headersSent = true;
        }

        for (const row of batch.dataRows) {
          this.throwIfAborted(abortController.signal);

          const obj: Record<string, unknown> = {};
          for (let i = 0; i < requestedColumns.length; i++) {
            const idx = fieldIndexMap[i];
            obj[requestedColumns[i]] = idx === -1 ? null : row[idx];
          }

          const chunk = this.streamWriter.serializeRow(obj);
          await this.streamWriter.writeChunk(res, chunk, abortController.signal);
          bytesWritten += chunk.length;
          rowCount += 1;
        }

        nextBatchId = batch.nextDataBatchId;
      } while (nextBatchId);

      return { rowCount, bytesWritten };
    } finally {
      res.off('close', onClose);
      res.off('error', onError);
    }
  }

  private abortReason(signal: AbortSignal): Error {
    return signal.reason instanceof Error ? signal.reason : new Error('Stream aborted');
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw this.abortReason(signal);
    }
  }

  private async readBatchOrAbort(
    reader: DataStorageReportReader,
    nextBatchId: string | undefined | null,
    signal: AbortSignal
  ): ReturnType<DataStorageReportReader['readReportDataBatch']> {
    if (signal.aborted) {
      throw this.abortReason(signal);
    }

    const readPromise = reader.readReportDataBatch(nextBatchId ?? undefined, STREAM_BATCH_SIZE);
    readPromise.catch(() => undefined);

    let onAbort!: () => void;
    const abortPromise = new Promise<never>((_, reject) => {
      onAbort = () => reject(this.abortReason(signal));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    abortPromise.catch(() => undefined);

    try {
      return await Promise.race([readPromise, abortPromise]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  private buildFieldIndexMap(
    dataHeaders: ReportDataHeader[],
    requestedColumns: string[]
  ): number[] {
    const headerIndex = new Map<string, number>();
    dataHeaders.forEach((header, index) => headerIndex.set(header.name, index));
    return requestedColumns.map(column => headerIndex.get(column) ?? -1);
  }

  private handleStreamFailure(res: Response, error: unknown): void {
    if (!res.headersSent) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`HTTP Data stream failed after headers sent: ${message}`);
    if (!res.closed) {
      res.destroy(error instanceof Error ? error : new Error(message));
    }
  }

  private async safelyFinalizeReader(reader: DataStorageReportReader): Promise<void> {
    try {
      await reader.finalize();
    } catch (err) {
      this.logger.warn(
        `Reader finalize failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
