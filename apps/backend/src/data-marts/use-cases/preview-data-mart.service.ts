import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
  RequestTimeoutException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import type { Role as RoleType } from '@owox/idp-protocol';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportLikeReadPlan } from '../dto/domain/report-like-read-plan';
import { FilterConfig, FilterConfigSchema } from '../dto/schemas/filter-config.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { BlendableSchemaService } from '../services/blendable-schema.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { calculatedFieldsOf } from '../calculated-fields/calculated-field.utils';
import {
  ProjectBillingService,
  RunKind,
} from '../services/project-billing/project-billing.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';

export const PREVIEW_DEFAULT_LIMIT = 10;
export const PREVIEW_MAX_LIMIT = 1000;

// Stays under the 180s operation timeout the preview route runs with (see DataMartsModule), so the
// caller gets this service's clean timeout message rather than the middleware's generic 408.
export const DEFAULT_PREVIEW_DEADLINE_MS = 150_000;

export class PreviewDataMartCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: RoleType[],
    public readonly limit: number | undefined,
    public readonly filters: unknown
  ) {}
}

export interface DataMartPreviewColumn {
  name: string;
  alias?: string;
  type?: string;
}

export type PreviewCell = string | number | boolean | null;

export interface DataMartPreviewResult {
  runId: string;
  columns: DataMartPreviewColumn[];
  rows: PreviewCell[][];
  rowCount: number;
  limit: number;
  /** More rows matched than `limit`; only the first `limit` are returned. */
  truncated: boolean;
}

export class PreviewAbortedError extends Error {
  constructor() {
    super('Preview was cancelled');
    this.name = 'PreviewAbortedError';
  }
}

/**
 * Reads a small sample of a Data Mart's rows for the Data Setup preview.
 *
 * Every native, reporting-visible field is projected; the caller chooses only a row limit and
 * WHERE filters. Each preview is one warehouse query, so each one is journalled in Run History
 * (type PREVIEW) and charged as a report run — including a re-run with the same inputs.
 *
 * Unlike `QueryDataMartService` (MCP), a DRAFT Data Mart can be previewed: seeing the data before
 * publishing is the point of the feature.
 */
@Injectable()
export class PreviewDataMartService {
  private readonly logger = new Logger(PreviewDataMartService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly composer: ReportSqlComposerService,
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    private readonly dataMartRunService: DataMartRunService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly projectBillingService: ProjectBillingService,
    @Optional() private readonly deadlineMs: number = DEFAULT_PREVIEW_DEADLINE_MS
  ) {}

  async run(command: PreviewDataMartCommand, signal?: AbortSignal): Promise<DataMartPreviewResult> {
    const limit = this.parseLimit(command.limit);
    const filters = this.parseFilters(command.filters);

    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );
    const canSee = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      dataMart.id,
      Action.SEE,
      command.projectId
    );
    if (!canSee) {
      throw new ForbiddenException('You do not have access to this Data Mart');
    }

    const accessor = { userId: command.userId, roles: command.roles };
    const schema = await this.blendableSchemaService.computeBlendableSchema(
      dataMart.id,
      dataMart.projectId,
      accessor
    );
    // Top-level fields only: a RECORD is shown as one JSON column, not as the record plus every
    // nested path. Calculated fields are left out — they are composed only when asked for by name.
    const calculatedNames = new Set(calculatedFieldsOf(schema.nativeFields).map(f => f.name));
    const fields = schema.nativeFields
      .map(field => field.name)
      .filter(name => !calculatedNames.has(name));
    if (fields.length === 0) {
      throw new BadRequestException(
        'This Data Mart has no visible fields in its Output Schema yet. Refresh the schema, then preview again.'
      );
    }

    // Read one extra row to learn whether more rows matched, without a separate COUNT query.
    const readPlan: ReportLikeReadPlan = {
      dataMart,
      columnConfig: fields,
      filterConfig: filters,
      limitConfig: limit + 1,
    };

    // Composed BEFORE the billing gate: an invalid filter is the caller's mistake, found without
    // touching the warehouse, so it must neither be charged nor clutter Run History.
    const composed = await this.composer.compose(readPlan, accessor);
    let executionSqlQuery: string;
    try {
      executionSqlQuery = this.composer.inlineStaticSql(
        dataMart.storage.type,
        composed.sql,
        composed.params
      );
    } catch {
      executionSqlQuery = composed.sql;
    }

    const runId = randomUUID();
    const startedAt = new Date();
    const query = { ...(filters ? { filters } : {}), limit };
    const failedMetadata = {
      columns: [],
      rowCount: 0,
      truncated: false,
      executionSqlQuery,
      filterCount: filters?.length ?? 0,
      query,
    };

    try {
      await this.projectBillingService.verifyCanPerformOperations(
        dataMart.projectId,
        RunKind.DATA_MART_PREVIEW_RUN
      );
    } catch (error) {
      await this.recordFailure(runId, dataMart, command.userId, startedAt, failedMetadata, error);
      throw error;
    }

    let result: { columns: DataMartPreviewColumn[]; rows: unknown[][] };
    try {
      result = await this.readRows(dataMart, readPlan, composed, limit, signal);
    } catch (error) {
      // A preview the person cancelled did not produce anything worth a Run History entry.
      if (error instanceof PreviewAbortedError) throw error;
      await this.recordFailure(runId, dataMart, command.userId, startedAt, failedMetadata, error);
      // A warehouse error (bad column, missing table, permissions) is not a server fault: hand the
      // warehouse's own sentence back so the person can fix the schema or the filter.
      if (error instanceof HttpException) throw error;
      throw new UnprocessableEntityException(
        `The data warehouse could not run the preview query: ${messageOf(error)}`
      );
    }

    const truncated = result.rows.length > limit;
    const rows = (truncated ? result.rows.slice(0, limit) : result.rows).map(row =>
      row.map(toPreviewCell)
    );

    let runRecorded = false;
    try {
      await this.dataMartRunService.recordPreviewRun({
        runId,
        dataMart,
        createdById: command.userId,
        startedAt,
        status: DataMartRunStatus.SUCCESS,
        metadata: {
          columns: result.columns.map(column => column.name),
          rowCount: rows.length,
          truncated,
          executionSqlQuery,
          filterCount: filters?.length ?? 0,
          query,
        },
      });
      runRecorded = true;
    } catch (auditError) {
      this.logger.warn(`recordPreviewRun (SUCCESS) failed; swallowing: ${messageOf(auditError)}`);
    }

    // Never bill a run with no Run History record — that charge would resolve to nothing.
    if (runRecorded) {
      try {
        await this.projectBillingService.registerDataMartPreviewRunConsumption(dataMart, runId);
      } catch (consumptionError) {
        this.logger.warn(
          `Failed to register preview run consumption ${runId}: ${messageOf(consumptionError)}`
        );
      }
    } else {
      this.logger.warn(
        `Skipping preview run consumption ${runId}: Run History record was not persisted.`
      );
    }

    return { runId, columns: result.columns, rows, rowCount: rows.length, limit, truncated };
  }

  private parseLimit(limit: number | undefined): number {
    if (limit === undefined || limit === null) return PREVIEW_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > PREVIEW_MAX_LIMIT) {
      throw new BadRequestException(`limit must be an integer between 1 and ${PREVIEW_MAX_LIMIT}`);
    }
    return limit;
  }

  private parseFilters(filters: unknown): FilterConfig {
    if (filters === undefined || filters === null) return null;
    const parsed = FilterConfigSchema.safeParse(filters);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid filters',
        details: parsed.error.issues,
      });
    }
    return parsed.data?.length ? parsed.data : null;
  }

  private async readRows(
    dataMart: DataMart,
    readPlan: ReportLikeReadPlan,
    composed: Awaited<ReturnType<ReportSqlComposerService['compose']>>,
    limit: number,
    signal: AbortSignal | undefined
  ): Promise<{ columns: DataMartPreviewColumn[]; rows: unknown[][] }> {
    const overReadLimit = limit + 1;
    // Stops the warehouse work on any early exit: client abort, deadline, or a read failure.
    const workController = new AbortController();
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;

    const deadline = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(() => {
        workController.abort();
        reject(
          new RequestTimeoutException(
            `The preview query did not finish within ${Math.round(this.deadlineMs / 1000)} seconds. Add a filter or lower the limit, then try again.`
          )
        );
      }, this.deadlineMs);
    });
    const aborted = new Promise<never>((_, reject) => {
      if (!signal) return;
      if (signal.aborted) {
        reject(new PreviewAbortedError());
        return;
      }
      abortListener = () => {
        workController.abort();
        reject(new PreviewAbortedError());
      };
      signal.addEventListener('abort', abortListener, { once: true });
    });

    const produce = (async () => {
      // `produce` owns its reader: the race below may settle first and must not finalize it.
      let reader: DataStorageReportReader | undefined;
      try {
        reader = await this.readerResolver.resolve(dataMart.storage.type);
        const description = await reader.prepareReportData(readPlan, {
          sqlOverride: composed.sql,
          sqlOverrideParams: composed.params,
          columnFilter: readPlan.columnConfig ?? undefined,
          blendedDataHeaders: composed.blendedDataHeaders,
          primaryKeyColumns: composed.primaryKeyColumns,
          calculatedFields: composed.calculatedFields,
          queryTimeoutMs: this.deadlineMs,
          signal: workController.signal,
        });
        const columns = description.dataHeaders.map(header => ({
          name: header.name,
          ...(header.alias ? { alias: header.alias } : {}),
          ...(header.storageFieldType ? { type: String(header.storageFieldType) } : {}),
        }));

        const rows: unknown[][] = [];
        let batchId: string | undefined;
        do {
          if (workController.signal.aborted) break;
          const batch = await reader.readReportDataBatch(batchId, overReadLimit - rows.length);
          rows.push(...batch.dataRows);
          batchId = batch.nextDataBatchId ?? undefined;
          // Empty page + non-null token (Redshift/Athena) would spin forever — stop.
          if (batch.dataRows.length === 0) break;
        } while (batchId && rows.length < overReadLimit);

        return { columns, rows };
      } finally {
        workController.abort();
        try {
          await reader?.finalize();
        } catch (finalizeError) {
          this.logger.warn(`reader.finalize() failed; ignoring: ${messageOf(finalizeError)}`);
        }
      }
    })();

    try {
      return await Promise.race([produce, deadline, aborted]);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (signal && abortListener) signal.removeEventListener('abort', abortListener);
    }
  }

  private async recordFailure(
    runId: string,
    dataMart: DataMart,
    createdById: string,
    startedAt: Date,
    metadata: Parameters<DataMartRunService['recordPreviewRun']>[0]['metadata'],
    error: unknown
  ): Promise<void> {
    try {
      await this.dataMartRunService.recordPreviewRun({
        runId,
        dataMart,
        createdById,
        startedAt,
        status:
          error instanceof ProjectOperationBlockedException
            ? DataMartRunStatus.RESTRICTED
            : DataMartRunStatus.FAILED,
        metadata,
        errors: [messageOf(error)],
      });
    } catch (auditError) {
      this.logger.warn(`Failed to record failed preview run ${runId}: ${messageOf(auditError)}`);
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Brings a warehouse cell to a JSON-safe scalar for the preview table. Readers hand back driver
 * values: BigInt, Date, single-`value` wrappers (BigQuery DATE/TIMESTAMP/NUMERIC), and objects or
 * arrays for RECORD/ARRAY columns — shown as JSON text.
 */
export function toPreviewCell(value: unknown): PreviewCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'object') {
    // Decimal wrappers (Big.js, Decimal.js) serialise themselves to a string through toJSON.
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') {
      const json: unknown = toJSON.call(value);
      if (json !== value) return toPreviewCell(json);
    }
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'value') {
      return toPreviewCell((value as { value: unknown }).value);
    }
    try {
      return JSON.stringify(value, (_key, inner) =>
        typeof inner === 'bigint' ? inner.toString() : inner
      );
    } catch {
      return String(value);
    }
  }
  return String(value);
}
