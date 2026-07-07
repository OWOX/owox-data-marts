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
    private readonly dataMartRunService: DataMartRunService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly projectBalanceService: ProjectBalanceService,
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    @Optional() private readonly queryDeadlineMs: number = DEFAULT_QUERY_DEADLINE_MS
  ) {}

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
      aggregationConfig: r.aggregationConfig ?? null,
      dateTruncConfig: r.dateTruncConfig ?? null,
      limitConfig: overReadLimit,
    };

    const runId = randomUUID();
    const startedAt = new Date();

    const queryMetadata = {
      fields: r.fields,
      ...(r.filterConfig ? { filters: r.filterConfig } : {}),
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
      // Inside the try so `dataMart` is resolved for the CANCELLED audit row.
      if (signal?.aborted) {
        throw new QueryAbortedError();
      }

      // Only the app-side timer and abort actually stop the server waiting; both throw, so billing
      // (success-path only) is skipped. Audit + billing stay OUTSIDE the race — fast local writes.
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

          // Run totals in PARALLEL with the rows read (wall-clock ≈ max, not sum); failure degrades to null.
          const totalsPromise: Promise<McpQueryDataMartResponse['totals']> =
            this.reportTotalsService
              .computeTotals(
                readPlan,
                accessor,
                dataMart.storage.type,
                queryTimeoutMs,
                workController.signal
              )
              .catch(totalsErr => {
                this.logger.warn(
                  `computeTotals failed; degrading to null: ${totalsErr instanceof Error ? totalsErr.message : String(totalsErr)}`
                );
                return null;
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
            aggregationConfig: readPlan.aggregationConfig ?? undefined,
            queryTimeoutMs,
            signal: workController.signal,
          });
          const columns = description.dataHeaders.map(header => header.name);

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
          const totals = await totalsPromise;
          return { columns, trimmed, truncated, totals };
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

      const { columns, trimmed, truncated, totals } = await Promise.race([
        produce,
        deadline,
        aborted,
      ]);

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

      return {
        columns,
        rows: trimmed,
        truncated,
        totals,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const status =
        err instanceof QueryAbortedError ? DataMartRunStatus.CANCELLED : DataMartRunStatus.FAILED;
      try {
        await this.dataMartRunService.recordMcpQueryRun({
          runId,
          dataMart,
          createdById: r.userId,
          startedAt,
          status,
          metadata: {
            columns: [],
            rowCount: 0,
            truncated: false,
            executionSqlQuery,
            filterCount: r.filterConfig?.length,
            aggregationCount: r.aggregationConfig?.length,
            query: queryMetadata,
          },
          errors: [errorMessage],
        });
      } catch (auditErr) {
        this.logger.warn(
          `recordMcpQueryRun (FAILED) failed; swallowing: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`
        );
      }
      throw err;
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      // The SDK reuses one signal across the request — detach so nothing outlives this run.
      if (signal && abortListener) signal.removeEventListener('abort', abortListener);
    }
  }
}
