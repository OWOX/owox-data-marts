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

export type SleeveShape = 'count-distinct' | 'value';

/**
 * which functions the blended query builder routes through a "sleeve" CTE — a
 * dimension-grain recomputation that avoids join-fan-out over/under-counting — when their
 * column is blended (joined), and which SHAPE each one's sleeve takes. See `collectSleeveMetrics`
 * in `blending/metric-sleeve.planner.ts`.
 *
 * Declared as an exhaustive record rather than a bare set on purpose. HAVING is NOT sleeve-
 * routed, so the output-controls validator gates the SAME set; a developer enabling HAVING for
 * one function would naturally delete it from a set — and would thereby silently switch that
 * function's SELECT back to the fan-out-prone dedup path, which is the defect this whole
 * feature exists to fix. With a record, every function must state an answer, and turning one
 * off is a visible `null`. The shape lives here too, so the builder derives its branching from
 * this table instead of re-listing functions.
 */
const SLEEVE_ROUTING: Record<ReportAggregateFunction, SleeveShape | null> = {
  COUNT_DISTINCT: 'count-distinct',
  SUM: 'value',
  AVG: 'value',
  P25: 'value',
  P50: 'value',
  P75: 'value',
  P95: 'value',
  // Same `value` shape: a joined roll-up read once per fanned main row is repeated verbatim
  // ("paid, shipped, paid, shipped"), which is not a different question the way COUNT's is.
  STRING_AGG: 'value',
  // Not because repetition changes them — it doesn't — but because a joined field's pre-join
  // roll-up collapses several raw rows into ONE value per join key. Off the sleeve, MIN/MAX
  // would read that collapsed value while SUM/AVG/percentiles read the raw rows, measuring one
  // column at two grains: `MIN <= AVG <= MAX` then fails (raw [10, 20] gives MIN=20, AVG=15).
  MIN: 'value',
  MAX: 'value',
  // COUNT deliberately counts the rows that SURVIVE the join, and ANY_VALUE is indifferent to
  // how often a value repeats.
  COUNT: null,
  ANY_VALUE: null,
};

const SLEEVE_ROUTING_ENTRIES = Object.entries(SLEEVE_ROUTING) as [
  ReportAggregateFunction,
  SleeveShape | null,
][];

export const SLEEVE_ROUTED_FUNCTIONS: ReadonlySet<ReportAggregateFunction> = new Set(
  SLEEVE_ROUTING_ENTRIES.filter(([, shape]) => shape !== null).map(([fn]) => fn)
);

export function sleeveShapeFor(fn: ReportAggregateFunction): SleeveShape | null {
  return SLEEVE_ROUTING[fn];
}

export const VALUE_SLEEVE_FUNCTIONS: ReadonlySet<ReportAggregateFunction> = new Set(
  SLEEVE_ROUTING_ENTRIES.filter(([, shape]) => shape === 'value').map(([fn]) => fn)
);

const PERCENTILE_FUNCTION_SET: ReadonlySet<string> = new Set(PERCENTILE_FUNCTIONS);

export function isPercentileFunction(
  fn: ReportAggregateFunction
): fn is (typeof PERCENTILE_FUNCTIONS)[number] {
  return PERCENTILE_FUNCTION_SET.has(fn);
}

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
