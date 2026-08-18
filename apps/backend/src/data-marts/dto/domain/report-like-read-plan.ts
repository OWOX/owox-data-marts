import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';
import { FilterConfig } from '../schemas/filter-config.schema';
import { GroupRestriction } from './group-restriction';
import { SortConfig } from '../schemas/sort-config.schema';
import { AggregationConfig } from '../schemas/aggregation-config.schema';
import { DateTruncConfig } from '../schemas/date-trunc-config.schema';
import { UniqueCountConfig } from '../schemas/unique-count-config.schema';
import { normalizeUniqueCountSources } from '../schemas/unique-count-sources';
import { usesSuffixedJoinedFieldNames as usesSuffixedJoinedFieldNamesFor } from '../../data-destination-types/enums/data-destination-type.enum';

// Must stay structurally compatible with the subset of `Report` fields read by
// `BlendedReportDataService.resolveBlendingDecision` and `DataStorageReportReader.prepareReportData`.
export interface ReportLikeReadPlan {
  dataMart: DataMart;
  columnConfig?: ReportColumnConfig;
  filterConfig?: FilterConfig;
  sortConfig?: SortConfig;
  limitConfig?: number | null;
  aggregationConfig?: AggregationConfig;
  /**
   * Totals only: restrict the query to rows of the groups the report's metric (HAVING) filters
   * keep. Totals have no GROUP BY, so those filters cannot apply there directly — see
   * `ReportSqlComposerService.composeTotals`.
   */
  groupRestriction?: GroupRestriction;
  dateTruncConfig?: DateTruncConfig;
  uniqueCountConfig?: UniqueCountConfig;
}

export type ReportLike = Report | ReportLikeReadPlan;

/**
 * Whether a report projects METRICS ONLY — it asks for aggregates or any Unique Count, so an empty
 * `columnConfig` means "no dimensions" rather than "every native column". The composer and the
 * output-controls validator both need exactly this decision, and a legacy `[]` on a report with
 * neither is the case that must NOT be read as metrics-only. Shared so the two cannot drift.
 */
export function isMetricsOnlyProjection(
  aggregations: { readonly length: number } | null | undefined,
  uniqueCountConfig: UniqueCountConfig | undefined
): boolean {
  return (
    (aggregations?.length ?? 0) > 0 || normalizeUniqueCountSources(uniqueCountConfig).length > 0
  );
}

/**
 * Whether joined-field labels for this read should put the Data Mart name after the field name
 * (`Field name (Data Mart name)`) instead of before it. Delegates to the destination capability
 * {@link usesSuffixedJoinedFieldNamesFor}.
 *
 * A read plan carries no destination — the totals query, the HTTP data endpoint and MCP all build
 * one — so those reads keep the prefix.
 *
 * The relation is checked by VALUE, not by key: a `DataDestination` is soft-deletable, and TypeORM's
 * eager join silently drops a soft-deleted row, leaving the property present but holding undefined
 * (the same trap {@link BlendableSchemaService} guards against for `targetDataMart`). An `in` check
 * alone would pass and then throw on `.type`, breaking reads that never needed the destination —
 * the generated-SQL preview among them.
 */
export function usesSuffixedJoinedFieldNames(report: ReportLike): boolean {
  const destination = 'dataDestination' in report ? report.dataDestination : undefined;
  return destination != null && usesSuffixedJoinedFieldNamesFor(destination.type);
}

/**
 * True when the report carries any output control — a filter, sort, limit,
 * aggregation, or date-trunc bucket. Single source for this predicate (run /
 * cache / compose / run-record paths) so the copies cannot drift.
 */
export function hasOutputControls(report: ReportLike): boolean {
  return (
    (report.filterConfig?.length ?? 0) > 0 ||
    (report.sortConfig?.length ?? 0) > 0 ||
    (report.aggregationConfig?.length ?? 0) > 0 ||
    (report.dateTruncConfig?.length ?? 0) > 0 ||
    report.limitConfig != null ||
    normalizeUniqueCountSources(report.uniqueCountConfig).length > 0
  );
}
