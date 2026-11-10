import type { FieldTypeCategory } from '../../../data-marts/dto/schemas/field-type-category';
import { INTERNAL_OPERATORS_BY_CATEGORY } from '../../../data-marts/dto/schemas/field-type-category';
import {
  type AggregationRole,
  resolveFieldGovernance,
} from '../../../data-marts/dto/schemas/field-aggregation-governance';
import type { ReportAggregateFunction } from '../../../data-marts/dto/schemas/aggregate-function.schema';
import { isArrayFieldType } from '../../../data-marts/data-storage-types/field-type-compatibility';
import {
  ADVERTISED_MCP_OPERATORS,
  BOOLEAN_MCP_OPERATORS,
  MCP_AGGREGATE_FUNCTIONS,
} from './query-data-mart.input';

/**
 * MCP operator → the internal FilterRule operator `mapOne` produces for it.
 * The operator lists below are derived by looking these up in the validator's per-category
 * operator sets, so what we advertise can only drift from what runs if this map
 * drifts from `mapOne` — and a spec locks the two together.
 */
export const MCP_TO_INTERNAL_OPERATOR: Readonly<Record<string, string>> = {
  eq: 'eq',
  neq: 'neq',
  contains: 'contains',
  not_contains: 'not_contains',
  starts_with: 'starts_with',
  ends_with: 'ends_with',
  in: 'in',
  not_in: 'not_in',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  between: 'between',
  is_blank: 'is_blank',
  is_not_blank: 'is_not_blank',
  // Legacy null/empty cluster (#6779): accepted, never advertised.
  is_empty: 'is_empty',
  is_not_empty: 'is_not_empty',
  is_null: 'is_null',
  is_not_null: 'is_not_null',
  before: 'lt',
  after: 'gt',
  in_last_n_days: 'relative_date',
  in_next_n_days: 'relative_date',
  this_week: 'relative_date',
  last_week: 'relative_date',
  this_month: 'relative_date',
  this_quarter: 'relative_date',
  last_quarter: 'relative_date',
  this_year: 'relative_date',
};

export const FIELD_TYPE_CATEGORIES: readonly FieldTypeCategory[] = [
  'number',
  'string',
  'date',
  'time',
  'boolean',
  'other',
];

const MCP_AGG_SET: ReadonlySet<string> = new Set(MCP_AGGREGATE_FUNCTIONS);

/**
 * The MCP operator name(s) that produce the given INTERNAL operator. Validation
 * errors carry the internal (post-mapping) operator; error messages must speak the
 * caller's vocabulary — e.g. internal 'relative_date' came from one of the calendar
 * presets, internal 'lt' from 'lt' or 'before'.
 */
export function mcpOperatorNamesForInternal(internalOperator: string): string[] {
  return Object.entries(MCP_TO_INTERNAL_OPERATOR)
    .filter(([, internal]) => internal === internalOperator)
    .map(([mcpName]) => mcpName);
}

/** MCP filter/slice operators that are legal on a field of the given category. */
export function mcpOperatorsForCategory(category: FieldTypeCategory): string[] {
  // The boolean menu is owned by BOOLEAN_MCP_OPERATORS, defined next to the eq/neq →
  // is_true/is_false translation it depends on.
  if (category === 'boolean') return [...BOOLEAN_MCP_OPERATORS];
  const internal = INTERNAL_OPERATORS_BY_CATEGORY[category];
  return ADVERTISED_MCP_OPERATORS.filter(op => {
    // before/after are date-language synonyms of lt/gt; they run on numbers too but
    // advertising them there only invites odd queries — offer them for date/time only.
    if ((op === 'before' || op === 'after') && category !== 'date' && category !== 'time') {
      return false;
    }
    return internal.has(MCP_TO_INTERNAL_OPERATOR[op] ?? '');
  });
}

/**
 * The aggregations a query may actually apply to this field — governance-resolved
 * (type defaults, narrowed by any per-field override) and restricted to the MCP
 * function set. The same resolution the validator enforces, so it cannot drift.
 */
export function effectiveMcpAggregations(
  fieldType: string,
  explicit?: {
    aggregationRole?: AggregationRole;
    allowedAggregations?: ReportAggregateFunction[];
  }
): ReportAggregateFunction[] {
  if (isArrayFieldType(fieldType)) return [];
  return resolveFieldGovernance(fieldType, explicit).allowedAggregations.filter(fn =>
    MCP_AGG_SET.has(fn)
  );
}
