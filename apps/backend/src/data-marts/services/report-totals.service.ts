import { Inject, Injectable, Logger } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportLike } from '../dto/domain/report-like-read-plan';
import { BlendableSchemaAccessor } from './blendable-schema.service';
import { ReportSqlComposerService } from './report-sql-composer.service';

export type ReportTotals = Record<string, number | string | boolean | null>;

/**
 * Computes the report's "Totals" summary row as a SEPARATE DWH query at run time.
 *
 * The totals SQL — every selected numeric field aggregated by all of its allowed functions,
 * over the full filtered dataset with NO grouping (see
 * {@link ReportSqlComposerService.composeTotals}) — produces a single row. This service runs
 * that SQL through a FRESH per-storage reader as an `sqlOverride`, resolves headers from the
 * SAME derived aggregation plan (so header names match the SQL output aliases), reads exactly
 * one row, and zips it into a flat `{ "<header.name>": value }` object.
 *
 * Returns `null` when no selected numeric field has an allowed aggregation (composeTotals
 * returns null) or when the dataset is empty (the DWH produced no row). Callers treat totals
 * as BEST-EFFORT: this service never participates in the primary run/stream success path.
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
    storageType: DataStorageType
  ): Promise<ReportTotals | null> {
    const totals = await this.reportSqlComposerService.composeTotals(report, accessor);
    if (!totals) {
      return null;
    }

    // Fresh transient reader, independent of the primary rows reader.
    const reader = await this.reportReaderResolver.resolve(storageType);
    try {
      const description = await reader.prepareReportData(report, {
        sqlOverride: totals.sql,
        sqlOverrideParams: totals.params,
        // Headers must derive from the SAME numeric-field aggregation plan composeTotals
        // built, so each header name equals its SQL output alias.
        columnFilter: totals.columns,
        aggregationConfig: totals.aggregations,
        // Joined-numeric totals are not native columns; their base type travels here so the
        // header path can widen it per aggregation function.
        blendedDataHeaders: totals.blendedDataHeaders,
        // Row Count / Unique Count are not part of the totals summary.
        rowCount: false,
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
}
