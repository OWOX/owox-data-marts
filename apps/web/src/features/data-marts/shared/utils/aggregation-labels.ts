import type { ReportAggregateFunction } from '../types/relationship.types';

/**
 * Human-readable Title Case label per aggregate function. Mirror of the backend
 * `REPORT_AGGREGATE_FUNCTION_LABELS`
 * (apps/backend/src/data-marts/dto/schemas/aggregation-labels.ts) so the function
 * picker, the configured-aggregation rows, and the produced output column all read
 * the same. Title Case is consistent with `Row Count` / `Unique Count`.
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
