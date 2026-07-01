import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';
import { FilterConfig } from '../schemas/filter-config.schema';
import { SortConfig } from '../schemas/sort-config.schema';
import { AggregationConfig } from '../schemas/aggregation-config.schema';
import { DateTruncConfig } from '../schemas/date-trunc-config.schema';
import { UniqueCountConfig } from '../schemas/unique-count-config.schema';

// Must stay structurally compatible with the subset of `Report` fields read by
// `BlendedReportDataService.resolveBlendingDecision` and `DataStorageReportReader.prepareReportData`.
export interface ReportLikeReadPlan {
  dataMart: DataMart;
  columnConfig?: ReportColumnConfig;
  filterConfig?: FilterConfig;
  sortConfig?: SortConfig;
  limitConfig?: number | null;
  aggregationConfig?: AggregationConfig;
  dateTruncConfig?: DateTruncConfig;
  uniqueCountConfig?: UniqueCountConfig;
  /**
   * Explicit opt-out of the automatic `COUNT(*)` Row Count column. When unset, Row Count
   * is on for any aggregated report. The Totals plan sets this to `false`: Row Count is a
   * per-group column, not a grand total, so it must not appear in the totals block.
   */
  rowCount?: boolean;
}

export type ReportLike = Report | ReportLikeReadPlan;

/**
 * Whether the automatic `COUNT(*)` Row Count column should be projected. Defaults to "on
 * for any aggregated report"; a read plan may explicitly opt out via `rowCount: false`
 * (the Totals query does this). Single source so the compose, blended-build, and header
 * paths cannot drift.
 */
export function shouldIncludeRowCount(report: ReportLike): boolean {
  const explicit = 'rowCount' in report ? report.rowCount : undefined;
  return explicit ?? (report.aggregationConfig?.length ?? 0) > 0;
}

/**
 * True when the report carries any output control — a filter, sort, limit,
 * aggregation, date-trunc bucket, or Row Count. Single source for this predicate (run /
 * cache / compose / run-record paths) so the copies cannot drift.
 */
export function hasOutputControls(report: ReportLike): boolean {
  return (
    (report.filterConfig?.length ?? 0) > 0 ||
    (report.sortConfig?.length ?? 0) > 0 ||
    (report.aggregationConfig?.length ?? 0) > 0 ||
    (report.dateTruncConfig?.length ?? 0) > 0 ||
    report.limitConfig != null ||
    report.uniqueCountConfig === true
  );
}
