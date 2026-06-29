import { ReportAggregateFunction } from './aggregate-function.schema';
import { AggregationRule } from './aggregation-config.schema';

/**
 * Single source of truth for aggregated output-column naming. The SQL `AS` alias
 * (see `SqlClauseRenderer.renderAggregatedSelect`) and the `ReportDataHeader.name`
 * (see `resolveReportDataHeaders`) MUST come from this same function — readers map
 * result rows to headers by name, so the alias and the header name have to match
 * exactly or every aggregated value maps to null.
 */
export const ROW_COUNT_LABEL = 'Row Count';
export const UNIQUE_COUNT_LABEL = 'Unique Count';

/**
 * Human-readable Title Case label per aggregate function — used in the web aggregation
 * UI as the display label. Title Case is consistent with `Row Count` / `Unique Count`.
 */
export const REPORT_AGGREGATE_FUNCTION_LABELS: Record<ReportAggregateFunction, string> = {
  SUM: 'Sum',
  AVG: 'Average',
  MIN: 'Min',
  MAX: 'Max',
  COUNT: 'Count',
  COUNT_DISTINCT: 'Count Unique',
  STRING_AGG: 'Combined',
  ANY_VALUE: 'Sample',
  P25: '25th Percentile',
  P50: 'Median',
  P75: '75th Percentile',
  P95: '95th Percentile',
};

/**
 * Uppercase spreadsheet-style token per aggregate function — the suffix used in the
 * output column name (see `aggregatedColumnLabel`). Distinct from the Title Case
 * display labels above: the column NAME comes from these tokens.
 */
export const REPORT_AGGREGATE_FUNCTION_TOKENS: Record<ReportAggregateFunction, string> = {
  SUM: 'SUM',
  AVG: 'AVG',
  MIN: 'MIN',
  MAX: 'MAX',
  COUNT: 'COUNT',
  COUNT_DISTINCT: 'COUNTUNIQUE',
  STRING_AGG: 'STRINGAGG',
  ANY_VALUE: 'ANYVALUE',
  P25: 'P25',
  P50: 'MEDIAN',
  P75: 'P75',
  P95: 'P95',
};

export function aggregateFunctionLabel(fn: ReportAggregateFunction): string {
  return REPORT_AGGREGATE_FUNCTION_LABELS[fn];
}

export function aggregatedColumnLabel(column: string, fn: ReportAggregateFunction): string {
  // `<column> | <TOKEN>`: the `|` separator is verified-legal in BigQuery output column
  // names (real-BQ probe accepted `revenue | SUM`), whereas parentheses are NOT (`revenue
  // (Sum)` was rejected). KNOWN LIMITATION: if `column` itself contains BigQuery-illegal
  // characters (e.g. a dotted nested-struct path), the resulting alias is still illegal.
  return `${column} | ${REPORT_AGGREGATE_FUNCTION_TOKENS[fn]}`;
}

/**
 * The aggregation functions applied to a column, in rule order. A column may carry
 * more than one (each producing its own output column). The SQL renderer and the
 * header resolver MUST both expand a column through this same helper so the per-column
 * function list — and its order — stays identical; otherwise the SQL alias and the
 * header name diverge and the reader nulls the data. A non-empty result means the
 * column is an aggregated metric (never a GROUP BY key).
 */
export function aggregationFunctionsForColumn(
  aggregations: AggregationRule[],
  column: string
): ReportAggregateFunction[] {
  return aggregations.filter(a => a.column === column).map(a => a.function);
}
