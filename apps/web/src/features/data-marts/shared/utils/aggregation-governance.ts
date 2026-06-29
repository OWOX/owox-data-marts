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
  other: ['COUNT', 'COUNT_DISTINCT', 'ANY_VALUE'],
};

const DEFAULTS_BY_CATEGORY: Record<FieldTypeCategory, FieldGovernance> = {
  number: { role: 'metric', allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'] },
  string: { role: 'dimension', allowedAggregations: ['COUNT', 'COUNT_DISTINCT'] },
  date: { role: 'dimension', allowedAggregations: ['MIN', 'MAX'] },
  time: { role: 'dimension', allowedAggregations: ['MIN', 'MAX'] },
  boolean: { role: 'dimension', allowedAggregations: ['COUNT', 'COUNT_DISTINCT'] },
  other: { role: 'dimension', allowedAggregations: ['COUNT', 'COUNT_DISTINCT'] },
};

/**
 * The full set of aggregation functions a field of the given type may use — the menu the
 * per-field allowed-aggregations selector and the report picker should offer.
 */
export function supportedAggregationsForType(fieldType: string): ReportAggregateFunction[] {
  return [...SUPPORTED_BY_CATEGORY[categorize(fieldType)]];
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
