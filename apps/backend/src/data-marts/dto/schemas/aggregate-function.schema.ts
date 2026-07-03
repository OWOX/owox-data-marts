// Keep this list in sync with `AGGREGATE_FUNCTIONS` on the web side
// (`apps/web/src/features/data-marts/shared/types/relationship.types.ts`).
export const AGGREGATE_FUNCTIONS = [
  'STRING_AGG',
  'MAX',
  'MIN',
  'SUM',
  'AVG',
  'COUNT',
  'COUNT_DISTINCT',
  'ANY_VALUE',
] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];

export const PERCENTILE_FUNCTIONS = ['P25', 'P50', 'P75', 'P95'] as const;

// Explicit tuple (not a spread of the two lists) so `z.enum(REPORT_AGGREGATE_FUNCTIONS)` infers a
// literal-union enum — TS widens `[...A, ...B] as const` to `readonly string[]`, which z.enum rejects.
export const REPORT_AGGREGATE_FUNCTIONS = [
  'STRING_AGG',
  'MAX',
  'MIN',
  'SUM',
  'AVG',
  'COUNT',
  'COUNT_DISTINCT',
  'ANY_VALUE',
  'P25',
  'P50',
  'P75',
  'P95',
] as const;
export type ReportAggregateFunction = (typeof REPORT_AGGREGATE_FUNCTIONS)[number];

// Compile-time guard: REPORT_AGGREGATE_FUNCTIONS must stay in sync with the two source lists.
// This line fails to compile if a value/order drifts.
type _AssertReportAggFnsInSync = typeof REPORT_AGGREGATE_FUNCTIONS extends readonly [
  ...typeof AGGREGATE_FUNCTIONS,
  ...typeof PERCENTILE_FUNCTIONS,
]
  ? true
  : never;
const _assertReportAggFnsInSync: _AssertReportAggFnsInSync = true;
void _assertReportAggFnsInSync;
