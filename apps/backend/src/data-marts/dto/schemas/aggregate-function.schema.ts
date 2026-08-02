// Keep this list in sync with `AGGREGATE_FUNCTIONS` on the web side
// (`apps/web/src/features/data-marts/shared/types/relationship.types.ts`) and the public traversal
// rule literals in `packages/api-client/src/data-marts.ts`.
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

/**
 * which functions the blended query builder routes through a "sleeve" CTE — a
 * dimension-grain recomputation that avoids join-fan-out over/under-counting — when their
 * column is blended (joined). See `collectSleeveMetrics` in `blending/metric-sleeve.planner.ts`.
 *
 * Declared as an exhaustive record rather than a bare set on purpose. HAVING is NOT sleeve-
 * routed, so the output-controls validator gates the SAME set; a developer enabling HAVING for
 * one function would naturally delete it from a set — and would thereby silently switch that
 * function's SELECT back to the fan-out-prone dedup path, which is the defect this whole
 * feature exists to fix. With a record, every function must state an answer, and turning one
 * off is a visible `false`.
 */
const SLEEVE_ROUTING: Record<ReportAggregateFunction, boolean> = {
  COUNT_DISTINCT: true,
  SUM: true,
  AVG: true,
  COUNT: false,
  MIN: false,
  MAX: false,
  ANY_VALUE: false,
  STRING_AGG: false,
  P25: false,
  P50: false,
  P75: false,
  P95: false,
};

export const SLEEVE_ROUTED_FUNCTIONS: ReadonlySet<ReportAggregateFunction> = new Set(
  (Object.entries(SLEEVE_ROUTING) as [ReportAggregateFunction, boolean][])
    .filter(([, routed]) => routed)
    .map(([fn]) => fn)
);

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
