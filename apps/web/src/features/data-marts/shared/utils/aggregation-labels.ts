import type { ReportAggregateFunction } from '../types/relationship.types';

/**
 * Human-readable Title Case label per aggregate function. Mirror of the backend
 * `REPORT_AGGREGATE_FUNCTION_LABELS`
 * (apps/backend/src/data-marts/dto/schemas/aggregation-labels.ts) so the function
 * picker, the configured-aggregation rows, and the produced output column all read
 * the same. Title Case is consistent with `Unique Count`.
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

export function aggregateFunctionLabel(fn: ReportAggregateFunction): string {
  return REPORT_AGGREGATE_FUNCTION_LABELS[fn];
}

/**
 * Synthetic output-column label. Mirror of the backend
 * `UNIQUE_COUNT_LABEL` (same backend module as the map above). The backend emits it
 * as the literal SQL `AS` alias and as the `ReportDataHeader.name`, so a drift here means
 * the web references a column the query never produces. Pinned by the drift-guard test.
 */
export const UNIQUE_COUNT_LABEL = 'Unique Count';

/**
 * `orders` → `orders__unique_count`, `orders.items` → `orders_items__unique_count`. Mirror of the
 * backend `buildJoinedUniqueCountColumnName` (services/blended-field-name.ts): the SQL `AS` alias,
 * the `ReportDataHeader.name`, and the value a sort rule stores. Derived from the alias path,
 * whose segments the Join Settings form validates against `^[a-z0-9_]+$`.
 *
 * The backend routes this through `buildBlendedFieldUnifiedName`, whose hashed branch only fires
 * for a DOTTED field name — `unique_count` has no dot, so the flat branch is the only reachable
 * one and is reproduced here directly.
 */
export function buildJoinedUniqueCountColumnName(aliasPath: string): string {
  return `${aliasPath.replace(/\./g, '_')}__unique_count`;
}
