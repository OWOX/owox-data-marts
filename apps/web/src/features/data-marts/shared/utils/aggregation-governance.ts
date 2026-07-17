import type { AggregationRole, ReportAggregateFunction } from '../types/relationship.types';
import {
  isBoolType,
  isDateType,
  isNumberType,
  isStringType,
  isTimeType,
} from '../../edit/components/ReportColumnPicker/output-controls-operators';

export interface FieldGovernance {
  role: AggregationRole;
  allowedAggregations: ReportAggregateFunction[];
}

// NOTE: this duplicates the backend `field-aggregation-governance.ts` (supported + defaults).
// The proper long-term fix is the backend exposing the resolved governance in the
// blendable-schema response so the web can drop these (follow-up). Keep in sync until then.
type FieldTypeCategory = 'number' | 'string' | 'date' | 'time' | 'boolean' | 'other';

function categorize(fieldType: string): FieldTypeCategory {
  if (isNumberType(fieldType)) return 'number';
  if (isStringType(fieldType)) return 'string';
  if (isDateType(fieldType)) return 'date';
  if (isTimeType(fieldType)) return 'time';
  if (isBoolType(fieldType)) return 'boolean';
  return 'other';
}

// The FULL menu of aggregations a field type permits (2026-06-29 meeting, point 2) — what
// the per-field allowed-aggregations selector and the report picker offer. DEFAULTS below
// is the on-by-default subset and MUST be a subset of this.
const SUPPORTED_BY_CATEGORY: Record<FieldTypeCategory, ReportAggregateFunction[]> = {
  number: ['SUM', 'AVG', 'MIN', 'MAX', 'ANY_VALUE', 'P25', 'P50', 'P75', 'P95'],
  string: ['MIN', 'MAX', 'ANY_VALUE', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'],
  date: ['MIN', 'MAX', 'ANY_VALUE', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'],
  time: ['MIN', 'MAX', 'ANY_VALUE', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'],
  boolean: ['COUNT', 'COUNT_DISTINCT', 'ANY_VALUE'],
  // `other` (JSON, geography, array, struct, …) is non-groupable / non-text-castable:
  // COUNT_DISTINCT / STRING_AGG fail at run time and the backend validator rejects them,
  // so only COUNT and ANY_VALUE are offered. Keep in sync with the backend governance.
  other: ['COUNT', 'ANY_VALUE'],
};

const DEFAULTS_BY_CATEGORY: Record<FieldTypeCategory, FieldGovernance> = {
  number: { role: 'metric', allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'] },
  string: { role: 'dimension', allowedAggregations: ['COUNT', 'COUNT_DISTINCT'] },
  date: { role: 'dimension', allowedAggregations: ['MIN', 'MAX'] },
  time: { role: 'dimension', allowedAggregations: ['MIN', 'MAX'] },
  boolean: { role: 'dimension', allowedAggregations: ['COUNT', 'COUNT_DISTINCT'] },
  other: { role: 'dimension', allowedAggregations: ['COUNT'] },
};

/**
 * Whether two (effective) field types resolve to the SAME aggregation category. Used to decide
 * when a dedup change should reset the analyst-allowed set: only a category change (e.g.
 * string→number) invalidates the current selection; a same-category change (SUM→MIN) must not.
 */
export function sameAggregationCategory(a: string, b: string): boolean {
  return categorize(a) === categorize(b);
}

/**
 * The full set of aggregation functions a field of the given type may use — the menu the
 * per-field allowed-aggregations selector and the report picker should offer.
 */
export function supportedAggregationsForType(fieldType: string): ReportAggregateFunction[] {
  return [...SUPPORTED_BY_CATEGORY[categorize(fieldType)]];
}

/**
 * Web mirror of the backend `computeEffectiveType` (field-aggregation.ts) — storage-agnostic,
 * since the web only needs a representative type string that `categorize`
 * (isNumberType/isStringType/…) resolves to the right CATEGORY, not an exact storage type.
 * A joined field's dedup rollup (`aggregateFunction`) can change what a field effectively IS
 * (e.g. COUNT_DISTINCT on a STRING yields an integer), which is what should drive the
 * post-join "available aggregations" menu, not the raw pre-dedup type.
 *
 * DRIFT CONTRACT: a function's output CATEGORY here MUST match backend `computeEffectiveType`.
 * It is NOT compile-checked across the web↔backend boundary — if the backend ever changes a
 * function's output category (e.g. SUM→float), update this switch by hand. Tracked for removal
 * via server-authoritative governance (drop this mirror once the API resolves it).
 */
export function effectiveAggregationType(
  rawType: string,
  aggFunc: ReportAggregateFunction | undefined
): string {
  if (!aggFunc) return rawType;
  switch (aggFunc) {
    case 'COUNT':
    case 'COUNT_DISTINCT':
      return 'INTEGER';
    case 'STRING_AGG':
      return 'STRING';
    case 'AVG':
    case 'P25':
    case 'P50':
    case 'P75':
    case 'P95':
      return 'FLOAT';
    case 'SUM':
    case 'MIN':
    case 'MAX':
    case 'ANY_VALUE':
      return rawType;
    default: {
      const _exhaustive: never = aggFunc;
      return _exhaustive;
    }
  }
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
  const defaults = DEFAULTS_BY_CATEGORY[categorize(fieldType)];
  // An override may only NARROW within the type's supported set — never authorize a function
  // the type cannot run (which would reach the backend and produce SQL the warehouse rejects).
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

/**
 * Column descriptor accepted by `resolveColumnAllowedAggregations`.
 * Matches the intersection of `OutputSettingsDropdownColumn` and
 * `AggregationDropdownColumn` so both components can pass their column directly.
 */
export interface AllowedAggregationsColumn {
  type: string;
  allowedAggregations?: ReportAggregateFunction[];
  /** Present on joined (blended) fields only; absent on native fields. */
  postJoinAggregations?: ReportAggregateFunction[];
}

/**
 * Single source of truth for the report-level allowed aggregation set for a column.
 *
 * - Joined fields (`postJoinAggregations !== undefined`): the DM-level analyst-allowed
 *   set governs; type-derived defaults are the fallback when the field has no override.
 * - Native fields: standard `resolveFieldGovernance` with any per-field override.
 */
export function resolveColumnAllowedAggregations(
  column: AllowedAggregationsColumn
): ReportAggregateFunction[] {
  if (column.postJoinAggregations !== undefined) {
    return column.postJoinAggregations.length > 0 ? [...column.postJoinAggregations] : [];
  }
  return resolveFieldGovernance(column.type, {
    allowedAggregations: column.allowedAggregations,
  }).allowedAggregations;
}
