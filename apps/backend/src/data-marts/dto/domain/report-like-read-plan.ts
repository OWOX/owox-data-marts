import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';
import { FilterConfig } from '../schemas/filter-config.schema';
import { RoutedGroupRestriction } from './group-restriction';
import { SortConfig } from '../schemas/sort-config.schema';
import { AggregationConfig } from '../schemas/aggregation-config.schema';
import { DateTruncConfig } from '../schemas/date-trunc-config.schema';
import { UniqueCountConfig } from '../schemas/unique-count-config.schema';
import { normalizeUniqueCountSources } from '../schemas/unique-count-sources';
import { usesSuffixedJoinedFieldNames as usesSuffixedJoinedFieldNamesFor } from '../../data-destination-types/enums/data-destination-type.enum';
import { calculatedFieldsOf } from '../../calculated-fields/calculated-field.utils';

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
   *
   * `having` carries the ROUTED rules: this plan is handed straight to the query
   * builder facade, so the verdict has to be decided before it is built, not after.
   */
  groupRestriction?: RoutedGroupRestriction;
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
 * aggregation, date-trunc bucket, or a selected calculated field. Single source for this
 * predicate (run / cache / compose / run-record paths) so the copies cannot drift.
 *
 * A calculated field has no warehouse column behind it, so selecting one must flip a plan to the
 * output-controls path even when nothing else does — otherwise a report like
 * `columnConfig: ['clicks', 'ctr']` with no other control passes this predicate as `false` at
 * every one of its callers (`RunReportService`, `ReportDataCacheService`,
 * `StreamHttpDataService`), never reaches `ReportSqlComposerService.compose`, and the reader
 * falls back to its own bare `buildQuery(definition, { columns })` call — which has no
 * `calculatedFields` to render the formula from and emits the metric's name as a plain,
 * nonexistent column. Failing at the warehouse ("Unrecognized name") is a WARNING sign, not
 * this predicate's job to prevent — but it exists precisely so this predicate routes the
 * report through the renderer that knows how, instead of the bypass.
 */
export function hasOutputControls(report: ReportLike): boolean {
  return (
    (report.filterConfig?.length ?? 0) > 0 ||
    (report.sortConfig?.length ?? 0) > 0 ||
    (report.aggregationConfig?.length ?? 0) > 0 ||
    (report.dateTruncConfig?.length ?? 0) > 0 ||
    report.limitConfig != null ||
    normalizeUniqueCountSources(report.uniqueCountConfig).length > 0 ||
    hasSelectedCalculatedField(report)
  );
}

/**
 * Whether `report.columnConfig` selects at least one calculated field from the Data Mart's
 * CURRENT schema. Reads `columnConfig` as given — it does not distinguish an analyst's genuine
 * explicit pick from a wildcard already materialised into an explicit list upstream: on the HTTP
 * Data ad-hoc path, `HttpDataColumnResolver.resolve` expands `*` / an absent `columns` param
 * before `readPlan.columnConfig` is ever built. Decision 10 wants explicit-only, and
 * that is enforced UPSTREAM of this predicate rather than here: `nativeColumnNames`
 * (`http-data-column-sets.util.ts`) excludes a calculated field from the implicit-all field list
 * the resolver expands a wildcard into, so a `?columns=` caller who never named the metric never
 * sees it in `columnConfig` in the first place — this predicate just reports what `columnConfig`
 * says, and by the time it runs that already reflects explicit-only selection.
 */
function hasSelectedCalculatedField(report: ReportLike): boolean {
  const columns = report.columnConfig;
  if (!columns?.length) return false;
  const schemaFields = report.dataMart.schema?.fields;
  if (!schemaFields?.length) return false;
  return calculatedFieldsOf(schemaFields).some(f => columns.includes(f.name));
}
