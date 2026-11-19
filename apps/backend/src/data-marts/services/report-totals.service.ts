import { Inject, Injectable, Logger } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportLike, ReportLikeReadPlan } from '../dto/domain/report-like-read-plan';
import { BlendableSchemaAccessor } from './blendable-schema.service';
import { ReportSqlComposerService } from './report-sql-composer.service';
import { columnFilterWithoutCalculatedFields } from '../calculated-fields/calculated-field.utils';
import { castError } from '@owox/internal-helpers';
import { TableReferenceMemo } from './data-mart-table-reference.service';

export type ReportTotals = Record<string, number | string | boolean | null>;

/**
 * Computes the report's "Totals" summary row as a SEPARATE DWH query at run time.
 *
 * The totals SQL — each selected totals metric (numeric fields, plus non-numeric fields the
 * report aggregates) summarized by all of its allowed functions, over the full filtered dataset
 * with NO grouping (see {@link ReportSqlComposerService.composeTotals}) — produces a single row.
 * This service runs that SQL through a FRESH per-storage reader as an `sqlOverride`, resolves
 * headers from the SAME derived aggregation plan (so header names match the SQL output aliases),
 * reads exactly one row, and zips it into a flat `{ "<header.name>": value }` object. A value can
 * be a number OR a string (e.g. MIN/MAX of a text metric).
 *
 * Returns `null` when the report has no totals metric with a summarizable function (composeTotals
 * returns null) or when the dataset is empty (the DWH produced no row). Callers treat totals as
 * BEST-EFFORT: this service never participates in the primary run/stream success path.
 *
 * It also counts the rows of the full result with a separate `COUNT(*)` query.
 */
@Injectable()
export class ReportTotalsService {
  private readonly logger = new Logger(ReportTotalsService.name);

  constructor(
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly reportReaderResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    private readonly reportSqlComposerService: ReportSqlComposerService
  ) {}

  async computeTotals(
    report: ReportLike,
    accessor: BlendableSchemaAccessor,
    storageType: DataStorageType,
    queryTimeoutMs?: number,
    signal?: AbortSignal,
    tableReferences?: TableReferenceMemo
  ): Promise<ReportTotals | null> {
    const totals = await this.reportSqlComposerService.composeTotals(
      report,
      accessor,
      tableReferences
    );
    if (!totals) {
      return null;
    }

    // Fresh transient reader, independent of the primary rows reader.
    const reader = await this.reportReaderResolver.resolve(storageType);
    try {
      const description = await reader.prepareReportData(report, {
        sqlOverride: totals.sql,
        sqlOverrideParams: totals.params,
        // Headers must derive from the SAME metrics aggregation plan composeTotals built, so
        // each header name equals its SQL output alias. A calculated field is not among
        // `aggregations` at all — it is already an aggregate, so deriveTotalsAggregations never
        // invents a SUM/AVG/MIN/MAX for it — and travels through `calculatedFields` below.
        columnFilter: columnFilterWithoutCalculatedFields(totals.columns, totals.calculatedFields),
        aggregationConfig: totals.aggregations,
        // Joined-numeric totals are not native columns; their base type travels here so the
        // header path can widen it per aggregation function.
        blendedDataHeaders: totals.blendedDataHeaders,
        // Unique Count is not part of the totals summary.
        calculatedFields: totals.calculatedFields,
        // Only when supplied, so non-MCP callers stay unchanged.
        ...(queryTimeoutMs !== undefined ? { queryTimeoutMs } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });

      const batch = await reader.readReportDataBatch(undefined, 1);
      const row = batch.dataRows[0];
      if (!row) {
        return null;
      }

      const result: ReportTotals = {};
      description.dataHeaders.forEach((header, index) => {
        result[header.name] = row[index] as number | string | boolean | null;
      });
      return result;
    } finally {
      await reader.finalize();
    }
  }

  /**
   * Counts the rows of the full result of a read, ignoring its LIMIT. Unlike totals, a missing
   * or malformed count throws: the caller must never take a wrong number for zero.
   */
  async computeRowCount(
    plan: ReportLikeReadPlan,
    accessor: BlendableSchemaAccessor,
    storageType: DataStorageType,
    queryTimeoutMs?: number,
    signal?: AbortSignal,
    tableReferences?: TableReferenceMemo
  ): Promise<number> {
    const count = await this.reportSqlComposerService.composeRowCount(
      plan,
      accessor,
      tableReferences
    );
    // Some readers ignore the signal, so a count that timed out must not start its query.
    signal?.throwIfAborted();

    const reader = await this.reportReaderResolver.resolve(storageType);
    try {
      await reader.prepareReportData(plan, {
        sqlOverride: count.sql,
        sqlOverrideParams: count.params,
        columnFilter: [count.alias],
        ...(queryTimeoutMs !== undefined ? { queryTimeoutMs } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });
      signal?.throwIfAborted();

      const batch = await reader.readReportDataBatch(undefined, 1);
      return parseRowCount(batch.dataRows[0]?.[0]);
    } finally {
      // Runs on success and on failure. A close failure must not hide the count or the first error.
      try {
        await reader.finalize();
      } catch (err) {
        this.logger.warn(`Failed to finalize the row count reader: ${castError(err).message}`);
      }
    }
  }
}

// Drivers return a count as a number, a bigint or a digit string. Anything else is an error.
function parseRowCount(value: unknown): number {
  let n: number | undefined;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'bigint' && value >= 0n) n = Number(value);
  else if (typeof value === 'string' && /^\d+$/.test(value)) n = Number(value);
  if (n !== undefined && Number.isSafeInteger(n) && n >= 0) return n;
  throw new Error('The row count query returned no valid count');
}
