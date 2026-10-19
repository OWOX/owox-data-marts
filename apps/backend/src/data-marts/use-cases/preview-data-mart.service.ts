import {
  BadRequestException,
  ConflictException,
  BadGatewayException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { TypeResolver } from '../../common/resolver/type-resolver';
import type { Role as RoleType } from '@owox/idp-protocol';
import {
  DATA_STORAGE_ERROR_MAPPER_RESOLVER,
  DATA_STORAGE_REPORT_READER_RESOLVER,
} from '../data-storage-types/data-storage-providers';
import { isConnected } from '../data-storage-types/data-mart-schema.utils';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageErrorMapper } from '../data-storage-types/interfaces/data-storage-error-mapper.interface';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import { ReportLikeReadPlan } from '../dto/domain/report-like-read-plan';
import { FilterConfig, FilterConfigSchema } from '../dto/schemas/filter-config.schema';
import { SortConfig, SortConfigSchema } from '../dto/schemas/sort-config.schema';
import { DataMart } from '../entities/data-mart.entity';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import {
  BlendableSchemaAccessor,
  BlendableSchemaService,
} from '../services/blendable-schema.service';
import { DataMartService } from '../services/data-mart.service';
import { calculatedFieldsOf } from '../calculated-fields/calculated-field.utils';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import {
  ProjectBillingService,
  RunKind,
} from '../services/project-billing/project-billing.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';

export const PREVIEW_DEFAULT_LIMIT = 10;
export const PREVIEW_MAX_LIMIT = 1000;

// Stays under the 180s operation timeout the preview route runs with (see DataMartsModule), so the
// caller gets this service's clean timeout message rather than the middleware's generic 408.
// The deadline itself answers 504, never 408: a browser may silently re-send a POST that got a 408
// on a reused keep-alive connection, which would re-run the warehouse query.
export const DEFAULT_PREVIEW_DEADLINE_MS = 150_000;

export class PreviewDataMartCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: RoleType[],
    public readonly limit: number | undefined,
    public readonly filters: unknown,
    public readonly sort: unknown = undefined
  ) {}
}

export interface DataMartPreviewColumn {
  name: string;
  alias?: string;
  type?: string;
}

export type PreviewCell = string | number | boolean | null;

/** Same marker the data-quality result parser shows for a date the driver could not represent. */
const INVALID_DATE_CELL = '[Invalid Date]';

export interface DataMartPreviewResult {
  columns: DataMartPreviewColumn[];
  rows: PreviewCell[][];
  rowCount: number;
  limit: number;
  /** More rows matched than `limit`; only the first `limit` are returned. */
  truncated: boolean;
}

/** Start observations are not revisions: SQL view composition can reload the saved definition. */
export interface DataMartPreviewObservation {
  preview: DataMartPreviewResult;
  revision: number;
  schemaInputRevision: number | null;
  schemaFreshness: 'current' | 'stale' | 'missing';
  observedModifiedAt: string;
  observedStatus: DataMartStatus;
  observedDefinitionType: DataMartDefinitionType | null;
  schemaActualizedAt: string | null;
  currentness: 'not-guaranteed' | 'changed-during-preview';
}

// 499 "Client Closed Request" (nginx convention): a cancel is neither a server fault nor worth an
// error-level log, and nobody reads the response anyway.
export const CLIENT_CLOSED_REQUEST_STATUS = 499;

export class PreviewAbortedError extends HttpException {
  constructor() {
    super('Preview was cancelled', CLIENT_CLOSED_REQUEST_STATUS);
    this.name = 'PreviewAbortedError';
  }
}

/**
 * Reads a small sample of a Data Mart's rows for the Data Setup preview.
 *
 * Every native, reporting-visible field is projected; the caller chooses only a row limit,
 * WHERE filters and ORDER BY — all applied in the warehouse, so a sorted preview shows the real top
 * rows, not a sorted sample. A preview is a look at the data while setting a Data Mart up: it is
 * not a run, so it is neither recorded in Run History nor counted as consumption. It is still
 * gated like other data reads, so a blocked or unlicensed project cannot use it.
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
    private readonly accessDecisionService: AccessDecisionService,
    @Inject(DATA_STORAGE_ERROR_MAPPER_RESOLVER)
    private readonly errorMapperResolver: TypeResolver<DataStorageType, DataStorageErrorMapper>,
    private readonly projectBillingService: ProjectBillingService,
    @Optional() private readonly deadlineMs: number = DEFAULT_PREVIEW_DEADLINE_MS
  ) {}

  async run(command: PreviewDataMartCommand, signal?: AbortSignal): Promise<DataMartPreviewResult> {
    return (await this.execute(command, signal)).preview;
  }

  async runForSetup(
    command: PreviewDataMartCommand,
    signal?: AbortSignal
  ): Promise<DataMartPreviewObservation> {
    try {
      return await this.execute(command, signal, true);
    } catch (error) {
      // Provider/composer exceptions may contain SQL, source parameters or credential details.
      if (error instanceof ProjectOperationBlockedException) {
        throw new ForbiddenException(
          'Preview is unavailable under the current project license or operation limits'
        );
      }
      if (error instanceof PreviewAbortedError) throw new PreviewAbortedError();
      if (error instanceof GatewayTimeoutException) {
        throw new GatewayTimeoutException(
          'Preview timed out; reduce its limit or retry in the app'
        );
      }
      if (error instanceof HttpException) {
        const status = error.getStatus();
        const messages: Record<number, string> = {
          400: 'Preview requires a configured Data Mart with a usable saved output schema',
          402: 'Preview is unavailable under the current project license',
          403: 'Preview is not permitted by current access or project operation limits',
          404: 'The Data Mart or its output is unavailable',
          409: 'Schema refresh required: actualize the schema for the current Data Mart definition before previewing',
          424: 'Preview source is unavailable; check the warehouse output and schema in the app',
          429: 'Preview is unavailable under current operation limits',
          499: 'Preview was cancelled',
          504: 'Preview timed out; reduce its limit or retry in the app',
        };
        if (messages[status]) throw new HttpException(messages[status], status);
      }
      if (error instanceof BusinessViolationException) {
        throw new BadRequestException('Preview output configuration requires repair in the app');
      }
      throw new BadGatewayException('Preview could not be completed; check setup in the app');
    }
  }

  private async execute(
    command: PreviewDataMartCommand,
    signal?: AbortSignal,
    setup = false
  ): Promise<DataMartPreviewObservation> {
    const limit = this.parseLimit(command.limit);
    const filters = this.parseFilters(command.filters);
    const sort = this.parseSort(command.sort);

    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );
    const checkAccess = setup
      ? this.accessDecisionService.canAccessStored.bind(this.accessDecisionService)
      : this.accessDecisionService.canAccess.bind(this.accessDecisionService);
    const canSee = await checkAccess(
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

    if (setup) {
      await this.requireSetupStorageAccess(dataMart, command);
      this.requireSetupSchema(dataMart);
    }
    const observedModifiedAt = dataMart.modifiedAt.toISOString();
    const observedStatus = dataMart.status;
    const observedDefinitionType = dataMart.definitionType ?? null;
    const schemaActualizedAt = dataMart.schemaActualizedAt?.toISOString() ?? null;
    const observation = setup ? configurationObservation(dataMart) : '';

    const accessor: BlendableSchemaAccessor = {
      userId: command.userId,
      roles: command.roles,
      ...(setup ? { scopeMode: 'read-only' as const } : {}),
    };
    const schema = await this.blendableSchemaService.computeBlendableSchema(
      dataMart.id,
      dataMart.projectId,
      accessor
    );
    // Top-level fields only: a RECORD is shown as one JSON column, not as the record plus every
    // nested path. Calculated fields are left out — they are composed only when asked for by name.
    // A DISCONNECTED field is gone from the source; selecting it would fail the whole preview.
    const calculatedNames = new Set(calculatedFieldsOf(schema.nativeFields).map(f => f.name));
    const fields = schema.nativeFields
      .filter(isConnected)
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
      sortConfig: sort,
      limitConfig: limit + 1,
    };

    // Already cancelled: start no warehouse work.
    throwIfAborted(signal);

    // A preview consumes nothing, but a blocked or unlicensed project must not read data through
    // it when reports, HTTP Data and MCP refuse. HTTP_DATA_RUN is the gate of the closest read:
    // the license-bound billing implementations only gate report-run kinds. Nothing is registered.
    await this.projectBillingService.verifyCanPerformOperations(
      dataMart.projectId,
      RunKind.HTTP_DATA_RUN
    );
    throwIfAborted(signal);

    let result: { columns: DataMartPreviewColumn[]; rows: unknown[][] };
    try {
      result = await this.readRows(dataMart, readPlan, accessor, schema, limit, signal);
    } catch (error) {
      // Validation, the deadline and a cancel are already HTTP errors. A composer rule violation
      // (e.g. a sort on a removed column) is raised before any query runs; its filter answers 400.
      if (error instanceof HttpException || error instanceof BusinessViolationException) {
        throw error;
      }
      // A warehouse error (bad column, missing table, permissions — including the technical view
      // a SQL Data Mart is read through) is not a server fault: hand the provider's own sentence
      // back, the same way HTTP Data does, so the person can fix the schema or the filter.
      this.logger.warn(`Preview of Data Mart ${dataMart.id} failed`);
      const mapper = await this.errorMapperResolver.resolve(dataMart.storage.type);
      throw mapper.toStorageReadError(error, { force: true });
    }

    const truncated = result.rows.length > limit;
    const rows = (truncated ? result.rows.slice(0, limit) : result.rows).map(row =>
      row.map(toPreviewCell)
    );

    let currentness: DataMartPreviewObservation['currentness'] = 'not-guaranteed';
    if (setup) {
      const current = await this.dataMartService.getByIdAndProjectId(
        command.dataMartId,
        command.projectId
      );
      await this.requireSetupStorageAccess(current, command);
      if (
        !(await checkAccess(
          command.userId,
          command.roles,
          EntityType.DATA_MART,
          current.id,
          Action.SEE,
          command.projectId
        ))
      ) {
        throw new ForbiddenException('Data Mart access changed during preview');
      }
      this.requireSetupSchema(current);
      if (observation !== configurationObservation(current)) currentness = 'changed-during-preview';
    }

    return {
      preview: { columns: result.columns, rows, rowCount: rows.length, limit, truncated },
      revision: dataMart.revision,
      schemaInputRevision: dataMart.schemaInputRevision ?? null,
      schemaFreshness: !dataMart.schema
        ? 'missing'
        : dataMart.schemaInputRevision === dataMart.revision - 1
          ? 'current'
          : 'stale',
      observedModifiedAt,
      observedStatus,
      observedDefinitionType,
      schemaActualizedAt,
      currentness,
    };
  }

  private requireSetupSchema(dataMart: DataMart): void {
    if (
      !dataMart.schema ||
      dataMart.schemaInputRevision == null ||
      dataMart.schemaInputRevision !== dataMart.revision - 1
    )
      throw new ConflictException(
        'Schema refresh required: actualize the schema for the current Data Mart definition before previewing'
      );
  }

  private async requireSetupStorageAccess(
    dataMart: DataMart,
    command: PreviewDataMartCommand
  ): Promise<void> {
    if (
      dataMart.projectId !== command.projectId ||
      dataMart.storage.projectId !== command.projectId ||
      !(await this.accessDecisionService.canAccessStored(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        dataMart.storage.id,
        Action.USE,
        command.projectId
      ))
    ) {
      throw new ForbiddenException('You do not have permission to use this Storage');
    }
  }

  private parseLimit(limit: number | undefined): number {
    if (limit === undefined || limit === null) return PREVIEW_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > PREVIEW_MAX_LIMIT) {
      throw new BadRequestException(`limit must be an integer between 1 and ${PREVIEW_MAX_LIMIT}`);
    }
    return limit;
  }

  private parseSort(sort: unknown): SortConfig {
    if (sort === undefined || sort === null) return null;
    const parsed = SortConfigSchema.safeParse(sort);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid sort', details: parsed.error.issues });
    }
    return parsed.data?.length ? parsed.data : null;
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

  /**
   * Composes and reads the preview inside one deadline/cancel race. Composing is not a pure read:
   * for a SQL Data Mart it refreshes the technical view in the warehouse, so it belongs to the
   * same bounded, cancellable and error-mapped section as the query itself.
   */
  private async readRows(
    dataMart: DataMart,
    readPlan: ReportLikeReadPlan,
    accessor: BlendableSchemaAccessor,
    schema: BlendableSchemaDto,
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
          new GatewayTimeoutException(
            `The preview query did not finish within ${Math.round(this.deadlineMs / 1000)} seconds. Add a filter or lower the limit, then try again.`
          )
        );
      }, this.deadlineMs);
    });
    const aborted = new Promise<never>((_, reject) => {
      if (!signal) return;
      if (signal.aborted) {
        workController.abort();
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
        if (workController.signal.aborted) throw new PreviewAbortedError();
        // The schema computed for the field list is reused, so validation does not compute it again.
        const composed = await this.composer.compose(readPlan, accessor, undefined, schema);
        if (workController.signal.aborted) throw new PreviewAbortedError();
        reader = await this.readerResolver.resolve(dataMart.storage.type);
        // Make the gap observable: this storage cannot stop the query at the deadline or on cancel.
        if (!reader.honorsQueryTimeout) {
          this.logger.warn(
            `Storage ${dataMart.storage.type} does not honor queryTimeoutMs; a preview it runs is not capped warehouse-side.`
          );
        }
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
        } catch {
          this.logger.warn('reader.finalize() failed; ignoring');
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
}

function configurationObservation(dataMart: DataMart): string {
  // Local comparison only. Never return or log this secret-bearing snapshot as a revision.
  return JSON.stringify({
    revision: dataMart.revision,
    modifiedAt: dataMart.modifiedAt,
    status: dataMart.status,
    definitionType: dataMart.definitionType,
    definition: dataMart.definition,
    schema: dataMart.schema,
    schemaActualizedAt: dataMart.schemaActualizedAt,
    blendedFieldsConfig: dataMart.blendedFieldsConfig,
    storageId: dataMart.storage.id,
    storageType: dataMart.storage.type,
    storageConfig: dataMart.storage.config,
    credentialId: dataMart.storage.credentialId,
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PreviewAbortedError();
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
  if (value instanceof Date) {
    // Databricks and Snowflake build a Date from the warehouse value; a DATE or TIMESTAMP outside
    // the JS Date range (years -271821..275760) becomes an Invalid Date that no longer carries the
    // raw value. The cell is not NULL in the warehouse, so it gets a marker rather than `null`.
    return Number.isNaN(value.getTime()) ? INVALID_DATE_CELL : value.toISOString();
  }
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
