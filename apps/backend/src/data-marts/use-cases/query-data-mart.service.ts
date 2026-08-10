import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportLikeReadPlan } from '../dto/domain/report-like-read-plan';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartService } from '../services/data-mart.service';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { BlendableSchemaAccessor } from '../services/blendable-schema.service';
import { ReportTotalsService } from '../services/report-totals.service';
import { SourceDataLastUpdatedService } from '../services/source-data-last-updated.service';
import { unavailableSourceDataLastUpdated } from '../dto/schemas/source-data-last-updated.schema';
import { DataMartRunService } from '../services/data-mart-run.service';
import { ProjectBalanceService } from '../services/project-balance.service';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import {
  McpQueryDataMartRequest,
  McpQueryDataMartResponse,
  QueryAbortedError,
  QueryTimeoutError,
} from '../facades/mcp-data-marts.facade';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

export class QueryDataMartCommand {
  constructor(public readonly request: McpQueryDataMartRequest) {}
}

// Guards direct facade callers that bypass the tool schema's own clamp.
const MAX_QUERY_LIMIT = 1000;

// Server-side deadline for one run; on expiry the run fails query_timeout and is not billed. Matches
// SERVER_TIMEOUT_MS (3 min), so the /mcp controller raises its socket timeout above this or the idle
// timer would blunt-reset a computing request first. Overridable via constructor for tests.
export const DEFAULT_QUERY_DEADLINE_MS = 3 * 60_000;

// How long a FINISHED query may wait for the auxiliary data-last-updated lookup. The lookup runs
// in parallel with the rows and normally settles first; this grace only matters when the dry run
// or a metadata call stalls. Without it, a 2-second query could sit behind the lookup's own 15s
// soft timeout — auxiliary metadata holding a ready answer hostage. Overridable for tests.
export const DEFAULT_DATA_LAST_UPDATED_GRACE_MS = 2_000;

/**
 * Reads rows for a single Data Mart on behalf of the `query_data_mart` MCP tool. The composed SQL is
 * passed to the reader as `sqlOverride` + `columnFilter`; without them it falls back to `SELECT *`.
 */
@Injectable()
export class QueryDataMartService {
  private readonly logger = new Logger(QueryDataMartService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly composer: ReportSqlComposerService,
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    private readonly reportTotalsService: ReportTotalsService,
    private readonly sourceDataLastUpdatedService: SourceDataLastUpdatedService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly projectBalanceService: ProjectBalanceService,
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    @Optional() private readonly queryDeadlineMs: number = DEFAULT_QUERY_DEADLINE_MS,
    @Optional()
    private readonly dataLastUpdatedGraceMs: number = DEFAULT_DATA_LAST_UPDATED_GRACE_MS
  ) {}

  private withGrace(
    lookup: Promise<McpQueryDataMartResponse['dataLastUpdated']>
  ): Promise<McpQueryDataMartResponse['dataLastUpdated']> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<McpQueryDataMartResponse['dataLastUpdated']>(resolve => {
      timer = setTimeout(() => {
        resolve(unavailableSourceDataLastUpdated());
      }, this.dataLastUpdatedGraceMs);
    });
    return Promise.race([lookup, grace]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  async run(
    command: QueryDataMartCommand,
    signal?: AbortSignal
  ): Promise<McpQueryDataMartResponse> {
    const r = command.request;

    // Bound before any read/billing — the facade types limit as a bare number, bypassing the tool clamp.
    if (!Number.isInteger(r.limit) || r.limit < 1 || r.limit > MAX_QUERY_LIMIT) {
      throw new BadRequestException(
        `query_data_mart: limit must be an integer between 1 and ${MAX_QUERY_LIMIT}`
      );
    }

    let dataMart: DataMart;
    try {
      dataMart = await this.dataMartService.getByIdAndProjectId(r.dataMartId, r.projectId);
    } catch (err) {
      // Missing / unpublished / hidden must all be indistinguishable — same not-found, no id leak.
      if (err instanceof NotFoundException) {
        throw new NotFoundException(`Data Mart not found`);
      }
      throw err;
    }

    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new NotFoundException(`Data Mart not found`);
    }

    const canSee = await this.accessDecisionService.canAccess(
      r.userId,
      r.roles,
      EntityType.DATA_MART,
      r.dataMartId,
      Action.SEE,
      r.projectId
    );
    if (!canSee) {
      throw new NotFoundException(`Data Mart not found`);
    }

    await this.projectBalanceService.verifyCanPerformOperations(r.projectId);

    const accessor: BlendableSchemaAccessor = { userId: r.userId, roles: r.roles };

    // Read one extra row to detect truncation without a separate COUNT query.
    const overReadLimit = r.limit + 1;
    const readPlan: ReportLikeReadPlan = {
      dataMart,
      columnConfig: r.fields,
      filterConfig: r.filterConfig ?? null,
      sortConfig: r.sortConfig ?? null,
      aggregationConfig: r.aggregationConfig ?? null,
      dateTruncConfig: r.dateTruncConfig ?? null,
      limitConfig: overReadLimit,
    };

    const runId = randomUUID();
    const startedAt = new Date();

    const queryMetadata = {
      fields: r.fields,
      ...(r.filterConfig ? { filters: r.filterConfig } : {}),
      ...(r.sortConfig ? { sort: r.sortConfig } : {}),
      ...(r.aggregationConfig ? { aggregations: r.aggregationConfig } : {}),
      ...(r.dateTruncConfig ? { dateBuckets: r.dateTruncConfig } : {}),
      limit: r.limit,
    };

    let executionSqlQuery: string | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    // Cancels the DWH work on any early exit (client abort / deadline / rows failure), not just abort.
    const workController = new AbortController();
    try {
      if (signal?.aborted) {
        throw new QueryAbortedError();
      }

      // Only the app-side timer and abort actually stop the server waiting; both throw, so neither
      // billing nor the audit row (both success-path only) happens. A timed-out or cancelled query
      // is deliberately NOT recorded in Run History — an MCP client aborts often, and a row per
      // abandoned request would bury the runs that matter.
      const deadline = new Promise<never>((_, reject) => {
        deadlineTimer = setTimeout(() => {
          workController.abort();
          reject(new QueryTimeoutError(this.queryDeadlineMs));
        }, this.queryDeadlineMs);
      });

      // Intentionally the SAME budget as the app-side timer, NOT lower: the warehouse clock starts
      // later (after compose/resolve/prepare above), so the JS timer reliably wins under normal load
      // and returns a clean query_timeout. The equal DWH cap is a cost backstop for a wedged event
      // loop where the JS timer can't fire. Only BigQuery/Snowflake honor it; others ignore it.
      const queryTimeoutMs = this.queryDeadlineMs;

      const aborted = new Promise<never>((_, reject) => {
        if (signal) {
          abortListener = () => {
            workController.abort();
            reject(new QueryAbortedError());
          };
          signal.addEventListener('abort', abortListener, { once: true });
        }
      });

      const produce = (async () => {
        // produce owns its reader and finalizes it here — the outer finally fires when the race
        // settles and would skip a reader assigned after a lost race (leak) or destroy one mid-read.
        let reader: DataStorageReportReader | undefined;
        try {
          const composed = await this.composer.compose(readPlan, accessor);
          const needsBlending = composed.needsBlending;
          // Inline params so Run History's "Executed SQL" is runnable; fall back if unsupported.
          try {
            executionSqlQuery = this.composer.inlineStaticSql(
              dataMart.storage.type,
              composed.sql,
              composed.params
            );
          } catch {
            executionSqlQuery = composed.sql;
          }

          // Run totals in PARALLEL with the rows read (wall-clock ≈ max, not sum). A failure must
          // not cost the caller its rows, so it degrades to null — but it is REPORTED rather than
          // swallowed: a null with no reason is indistinguishable from "this report has no totals
          // metric", and the caller then either shows no total or sums the returned page itself,
          // which is wrong for any non-additive metric. Logged at error level for the same reason:
          // a whole class of reports losing their totals should be visible in production.
          const totalsPromise: Promise<{
            totals: McpQueryDataMartResponse['totals'];
            totalsError?: string;
          }> = this.reportTotalsService
            .computeTotals(
              readPlan,
              accessor,
              dataMart.storage.type,
              queryTimeoutMs,
              workController.signal
            )
            .then(totals => ({ totals }))
            .catch(totalsErr => {
              const reason = totalsErr instanceof Error ? totalsErr.message : String(totalsErr);
              this.logger.error(
                `computeTotals failed for Data Mart ${dataMart.id}; degrading to null: ${reason}`
              );
              return { totals: null, totalsError: reason };
            });

          // Third parallel track alongside rows and totals. Reads the COMPOSED sql, so a blended
          // result reports every joined Data Mart's tables, not just the primary one. The service
          // never rejects and caps itself with its own soft deadline, so it cannot delay or fail
          // the read; it costs no consumption because billing is tied to the run, not to this.
          const dataLastUpdatedPromise: Promise<McpQueryDataMartResponse['dataLastUpdated']> =
            this.sourceDataLastUpdatedService.resolveForSql({
              storage: dataMart.storage,
              sql: composed.sql,
              params: composed.params,
              signal: workController.signal,
            });

          reader = await this.readerResolver.resolve(dataMart.storage.type);
          // Make the silent gap observable: a cap was requested but this storage drops it, so the
          // query has no warehouse-side cost cap — only the app-side deadline. Adding a new storage
          // without honorsQueryTimeout will surface here.
          if (queryTimeoutMs !== undefined && !reader.honorsQueryTimeout) {
            this.logger.warn(
              `Storage ${dataMart.storage.type} does not honor queryTimeoutMs; no warehouse-side cost cap for this query.`
            );
          }
          const description = await reader.prepareReportData(readPlan, {
            sqlOverride: composed.sql,
            sqlOverrideParams: composed.params,
            columnFilter: r.fields,
            // A joined column is absent from the native schema, so only these carry its type.
            blendedDataHeaders: composed.blendedDataHeaders,
            aggregationConfig: composed.aggregations ?? readPlan.aggregationConfig ?? undefined,
            queryTimeoutMs,
            signal: workController.signal,
          });
          const columns = description.dataHeaders.map(header => header.name);
          const columnMetadata = description.dataHeaders.map(header => ({
            name: header.name,
            displayName: header.alias ?? header.name,
            ...(header.description ? { description: header.description } : {}),
            ...(header.storageFieldType ? { type: header.storageFieldType } : {}),
          }));

          const rows: unknown[][] = [];
          let batchId: string | undefined;
          do {
            // Cooperative cancellation: once the client aborted, stop paging — the DWH job is capped
            // by queryTimeoutMs, but there is no point buffering more rows nobody will receive.
            if (signal?.aborted) {
              throw new QueryAbortedError();
            }
            const batch = await reader.readReportDataBatch(batchId, overReadLimit - rows.length);
            rows.push(...batch.dataRows);
            batchId = batch.nextDataBatchId ?? undefined;
            // Empty page + non-null token (Redshift/Athena) would spin forever — stop.
            if (batch.dataRows.length === 0) break;
          } while (batchId && rows.length < overReadLimit);

          const truncated = rows.length > r.limit;
          const trimmed = truncated ? rows.slice(0, r.limit) : rows;
          const { totals, totalsError } = await totalsPromise;
          // Rows and totals are done; the auxiliary block gets a short grace, then degrades to
          // unavailable rather than delaying a finished answer by its own 15s soft timeout. The
          // abandoned lookup does not keep running: the finally below aborts workController and
          // the resolver stops on that signal.
          const dataLastUpdated = await this.withGrace(dataLastUpdatedPromise);
          return {
            columns,
            columnMetadata,
            trimmed,
            truncated,
            totals,
            totalsError,
            dataLastUpdated,
            needsBlending,
          };
        } finally {
          workController.abort();
          try {
            await reader?.finalize();
          } catch (finalizeErr) {
            this.logger.warn(
              `reader.finalize() failed; ignoring: ${finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr)}`
            );
          }
        }
      })();

      const {
        columns,
        columnMetadata,
        trimmed,
        truncated,
        totals,
        totalsError,
        dataLastUpdated,
        needsBlending,
      } = await Promise.race([produce, deadline, aborted]);

      // Audit save is best-effort — a successful read must not become FAILED.
      let runRecorded = false;
      try {
        await this.dataMartRunService.recordMcpQueryRun({
          runId,
          dataMart,
          createdById: r.userId,
          startedAt,
          status: DataMartRunStatus.SUCCESS,
          metadata: {
            columns,
            // Rows read (audit); the tool's byte-cap may trim the transported payload below this.
            rowCount: trimmed.length,
            truncated,
            executionSqlQuery,
            filterCount: r.filterConfig?.length,
            aggregationCount: r.aggregationConfig?.length,
            query: queryMetadata,
            // Journalled so Run History can later show what the sources looked like at run time.
            // This is a record of a past run, never a cache to answer a future request from.
            dataLastUpdated,
            // The caller only gets a generic sentence, so this is the only place the reason survives.
            ...(totalsError ? { totalsError } : {}),
          },
        });
        runRecorded = true;
      } catch (auditErr) {
        this.logger.warn(
          `recordMcpQueryRun (SUCCESS) failed; swallowing: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`
        );
      }

      // Never bill a run with no audit record — that charge would resolve to nothing (untraceable).
      if (runRecorded) {
        try {
          await this.consumptionTrackingService.registerMcpQueryRunConsumption(dataMart, runId);
        } catch (consumptionErr) {
          this.logger.warn(
            `Failed to register MCP Query run consumption ${runId}: ${consumptionErr instanceof Error ? consumptionErr.message : String(consumptionErr)}`
          );
        }
      } else {
        this.logger.warn(
          `Skipping MCP Query run consumption ${runId}: Run History record was not persisted, suppressing billing to avoid an untraceable charge.`
        );
      }

      // A non-blended query reads exactly this Data Mart's own sources, so the measurement is
      // safe to save as the last-known value (same meaning as the manual Check now). Blended
      // queries span several Data Marts and only journal into their run record above.
      if (!needsBlending && dataLastUpdated.dataLastUpdatedAt !== null) {
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

      return {
        columns,
        columnMetadata,
        rows: trimmed,
        truncated,
        totals,
        dataLastUpdated,
        totalsError,
        dataMart: {
          id: dataMart.id,
          title: dataMart.title,
        },
        executedSql: executionSqlQuery,
      };
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      // The SDK reuses one signal across the request — detach so nothing outlives this run.
      if (signal && abortListener) signal.removeEventListener('abort', abortListener);
    }
  }
}
