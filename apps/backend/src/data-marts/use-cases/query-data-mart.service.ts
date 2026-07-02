import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportLikeReadPlan } from '../dto/domain/report-like-read-plan';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartService } from '../services/data-mart.service';
import { DataMart } from '../entities/data-mart.entity';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { BlendableSchemaAccessor } from '../services/blendable-schema.service';
import { ReportTotalsService } from '../services/report-totals.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { ProjectBalanceService } from '../services/project-balance.service';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import {
  McpQueryDataMartRequest,
  McpQueryDataMartResponse,
} from '../facades/mcp-data-marts.facade';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

export class QueryDataMartCommand {
  constructor(public readonly request: McpQueryDataMartRequest) {}
}

/**
 * Reads rows for a single Data Mart on behalf of the `query_data_mart` MCP tool.
 *
 * The SQL is composed from the read plan and handed to the reader as `sqlOverride`, with
 * `columnFilter` restricting the emitted headers to the selected fields in their requested
 * order. Without these the reader falls back to `SELECT *` and ignores the field selection,
 * filters, and limit.
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
    private readonly consumptionTrackingService: ConsumptionTrackingService
  ) {}

  async run(command: QueryDataMartCommand): Promise<McpQueryDataMartResponse> {
    const r = command.request;

    let dataMart: DataMart;
    try {
      dataMart = await this.dataMartService.getByIdAndProjectId(r.dataMartId, r.projectId);
    } catch (err) {
      // Normalize the missing-DM message to the exact constant the hidden-DM path throws below —
      // getByIdAndProjectId's message embeds the id + projectId, which would let a caller tell
      // "doesn't exist" apart from "exists but you can't see it". Both must be indistinguishable.
      if (err instanceof NotFoundException) {
        throw new NotFoundException(`Data Mart not found`);
      }
      throw err;
    }

    // Throw not-found (not forbidden) on a hidden DM so the caller cannot tell it apart from a missing one.
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

    let reader: DataStorageReportReader | undefined;
    let executionSqlQuery: string | undefined;
    try {
      const composed = await this.composer.compose(readPlan, accessor);
      // Persist a self-contained SQL string for Run History (parameters inlined, like report
      // runs) so the recorded "Executed SQL" is runnable, not @p/? placeholders. Best-effort:
      // fall back to the parameterized SQL if inlining is unsupported for this storage.
      try {
        executionSqlQuery = this.composer.inlineStaticSql(
          dataMart.storage.type,
          composed.sql,
          composed.params
        );
      } catch {
        executionSqlQuery = composed.sql;
      }
      reader = await this.readerResolver.resolve(dataMart.storage.type);
      const description = await reader.prepareReportData(readPlan, {
        sqlOverride: composed.sql,
        sqlOverrideParams: composed.params,
        columnFilter: r.fields,
        aggregationConfig: readPlan.aggregationConfig ?? undefined,
      });
      const columns = description.dataHeaders.map(header => header.name);

      const rows: unknown[][] = [];
      let batchId: string | undefined;
      do {
        const batch = await reader.readReportDataBatch(batchId, overReadLimit - rows.length);
        rows.push(...batch.dataRows);
        batchId = batch.nextDataBatchId ?? undefined;
      } while (batchId && rows.length < overReadLimit);

      const truncated = rows.length > r.limit;
      const trimmed = truncated ? rows.slice(0, r.limit) : rows;

      // computeTotals is a secondary DWH query — degrade gracefully on failure.
      let totals: McpQueryDataMartResponse['totals'] = null;
      try {
        totals = await this.reportTotalsService.computeTotals(
          readPlan,
          accessor,
          dataMart.storage.type
        );
      } catch (totalsErr) {
        this.logger.warn(
          `computeTotals failed; degrading to null: ${totalsErr instanceof Error ? totalsErr.message : String(totalsErr)}`
        );
      }

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
            // Rows read from the warehouse (audit). The client's `returned_rows` may be lower
            // if the tool's byte-cap trims the payload — an intentional divergence: metadata
            // records the query result size, the response reflects the transported payload.
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

      // Consumption is best-effort AND gated on the audit write: never bill a run that has no
      // Run History record. That would over-charge the user with a consumption `reportRunId` that
      // resolves to nothing — an untraceable charge. If the audit write failed we suppress billing
      // (favor a revenue miss over an untraceable charge). A tracking failure still must not fail
      // an already-successful read.
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
      // Best-effort — a failing audit write must not replace the original error.
      try {
        await this.dataMartRunService.recordMcpQueryRun({
          runId,
          dataMart,
          createdById: r.userId,
          startedAt,
          status: DataMartRunStatus.FAILED,
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
      // Best-effort, like every other secondary op here: a finalize() rejection (e.g. Snowflake
      // adapter.destroy / Databricks cursor close on a network blip) must not convert an
      // already-returned, already-billed success into a tool error, nor mask the original error.
      try {
        await reader?.finalize();
      } catch (finalizeErr) {
        this.logger.warn(
          `reader.finalize() failed; ignoring: ${finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr)}`
        );
      }
    }
  }
}
