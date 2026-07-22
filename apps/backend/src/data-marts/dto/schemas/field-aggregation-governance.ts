import { ReportAggregateFunction } from './aggregate-function.schema';
import { categorizeFieldType, FieldTypeCategory } from './field-type-category';

export type AggregationRole = 'dimension' | 'metric';

export interface FieldGovernance {
  role: AggregationRole;
  allowedAggregations: ReportAggregateFunction[];
}

/**
 * Aggregation functions that do NOT reduce to a meaningful single grand total: `ANY_VALUE`
 * returns one arbitrary row's value and `STRING_AGG` concatenates the whole column. Totals
 * summaries omit them. The same pair is mapped to a DIMENSION by the Looker Studio aggregation
 * mapper for the same reason — keep the two lists aligned when adding a new non-summarizable fn.
 */
export const NON_SUMMARIZABLE_AGGREGATIONS: ReadonlySet<ReportAggregateFunction> = new Set([
  'ANY_VALUE',
  'STRING_AGG',
]);

interface CategoryDefault {
  role: AggregationRole;
  allowedAggregations: ReportAggregateFunction[];
}

/**
 * The FULL menu of aggregations a field type permits (2026-06-29 meeting, point 2). This
 * is what the per-field "allowed aggregations" selector and the report aggregation picker
 * offer — e.g. percentiles are NOT offered for DATE/STRING; SUM/AVG only for numerics.
 * `DEFAULTS_BY_CATEGORY` below is the subset turned ON by default and MUST be a subset of
 * this. Keep in sync with the web/extension `aggregation-governance.ts` mirrors.
 */
const SUPPORTED_BY_CATEGORY: Record<FieldTypeCategory, ReportAggregateFunction[]> = {
  number: ['SUM', 'AVG', 'MIN', 'MAX', 'ANY_VALUE', 'P25', 'P50', 'P75', 'P95'],
  string: ['MIN', 'MAX', 'ANY_VALUE', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'],
  date: ['MIN', 'MAX', 'ANY_VALUE', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'],
  time: ['MIN', 'MAX', 'ANY_VALUE', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'],
  boolean: ['COUNT', 'COUNT_DISTINCT', 'ANY_VALUE'],
  // `other` = non-groupable, non-text-castable types (JSON, geography, array, struct,
  // super, variant). COUNT_DISTINCT / STRING_AGG fail at run time on these (and the
  // validator type-floor rejects them), so they are NOT offered — only COUNT and ANY_VALUE.
  other: ['COUNT', 'ANY_VALUE'],
};

/**
 * The subset of aggregations turned ON by default per type (2026-06-29 meeting, point 3),
 * used when a field carries no explicit `allowedAggregations` override. ANY_VALUE is
 * supported (above) but never a default. Single source so the governance map and any UI
 * hint cannot diverge.
 */
const DEFAULTS_BY_CATEGORY: Record<FieldTypeCategory, CategoryDefault> = {
  number: { role: 'metric', allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'] },
  string: { role: 'dimension', allowedAggregations: ['COUNT', 'COUNT_DISTINCT'] },
  date: { role: 'dimension', allowedAggregations: ['MIN', 'MAX'] },
  time: { role: 'dimension', allowedAggregations: ['MIN', 'MAX'] },
  boolean: { role: 'dimension', allowedAggregations: ['COUNT', 'COUNT_DISTINCT'] },
  other: { role: 'dimension', allowedAggregations: ['COUNT'] },
};

/**
 * The full set of aggregation functions a field of the given type may use — the menu the
 * per-field allowed-aggregations selector and the report picker should offer. A returned
 * fresh array so callers cannot mutate the shared map.
 */
export function supportedAggregationsForType(fieldType: string): ReportAggregateFunction[] {
  return supportedAggregationsForCategory(categorizeFieldType(fieldType));
}

/** Same menu keyed by category — for callers that build type-level matrices, not per-field checks. */
export function supportedAggregationsForCategory(
  category: FieldTypeCategory
): ReportAggregateFunction[] {
  return [...SUPPORTED_BY_CATEGORY[category]];
}

/** The subset enabled by default (no per-field override) for a category. */
export function defaultAggregationsForCategory(
  category: FieldTypeCategory
): ReportAggregateFunction[] {
  return [...DEFAULTS_BY_CATEGORY[category].allowedAggregations];
}

/**
 * Resolve a field's aggregation governance: its dimension/metric role and the set of
 * aggregation functions a report may apply to it. Absent explicit values fall back to
 * type-derived defaults; an explicit value (including an empty array) is an override.
 */
export function resolveFieldGovernance(
  fieldType: string,
  explicit?: {
    aggregationRole?: AggregationRole;
    allowedAggregations?: ReportAggregateFunction[];
  }
): FieldGovernance {
  const defaults = DEFAULTS_BY_CATEGORY[categorizeFieldType(fieldType)];
  // An override may only NARROW within the type's supported set — never authorize a function
  // the type cannot run (which would reach the renderer and produce SQL the warehouse rejects).
  const allowedAggregations = explicit?.allowedAggregations
    ? intersectWithSupported(fieldType, explicit.allowedAggregations)
    : [...defaults.allowedAggregations];
  return {
    role: explicit?.aggregationRole ?? defaults.role,
    allowedAggregations,
  };
}

function intersectWithSupported(
  fieldType: string,
  requested: ReportAggregateFunction[]
): ReportAggregateFunction[] {
  const supported = new Set(supportedAggregationsForType(fieldType));
  return requested.filter(fn => supported.has(fn));
}
