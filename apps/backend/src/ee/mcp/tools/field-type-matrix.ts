import type { FieldTypeCategory } from '../../../data-marts/dto/schemas/field-type-category';
import { INTERNAL_OPERATORS_BY_CATEGORY } from '../../../data-marts/services/output-controls-validator.service';
import {
  type AggregationRole,
  defaultAggregationsForCategory,
  resolveFieldGovernance,
  supportedAggregationsForCategory,
} from '../../../data-marts/dto/schemas/field-aggregation-governance';
import type { ReportAggregateFunction } from '../../../data-marts/dto/schemas/aggregate-function.schema';
import { MCP_AGGREGATE_FUNCTIONS, SUPPORTED_MCP_OPERATORS } from './query-data-mart.input';

/**
 * MCP operator → the internal FilterRule operator `mapOne` produces for it.
 * The matrix below is derived by looking these up in the validator's per-category
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
  // eq/neq with a true|false value translate to the internal is_true/is_false,
  // so boolean fields accept them even though 'eq' is not in the boolean op set.
  if (category === 'boolean') return ['eq', 'neq', 'is_null', 'is_not_null'];
  const internal = INTERNAL_OPERATORS_BY_CATEGORY[category];
  return SUPPORTED_MCP_OPERATORS.filter(op => {
    // before/after are date-language synonyms of lt/gt; they run on numbers too but
    // advertising them there only invites odd queries — offer them for date/time only.
    if ((op === 'before' || op === 'after') && category !== 'date' && category !== 'time') {
      return false;
    }
    return internal.has(MCP_TO_INTERNAL_OPERATOR[op] ?? '');
  });
}

/** Full aggregation menu for a category, restricted to functions the MCP input schema accepts. */
export function mcpSupportedAggregationsForCategory(
  category: FieldTypeCategory
): ReportAggregateFunction[] {
  return supportedAggregationsForCategory(category).filter(fn => MCP_AGG_SET.has(fn));
}

/** Default-enabled aggregations for a category, restricted to the MCP function set. */
export function mcpDefaultAggregationsForCategory(
  category: FieldTypeCategory
): ReportAggregateFunction[] {
  return defaultAggregationsForCategory(category).filter(fn => MCP_AGG_SET.has(fn));
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
  return resolveFieldGovernance(fieldType, explicit).allowedAggregations.filter(fn =>
    MCP_AGG_SET.has(fn)
  );
}

const CATEGORY_TYPE_EXAMPLES: Record<FieldTypeCategory, string> = {
  number: 'INTEGER, FLOAT, NUMERIC, …',
  string: 'STRING, VARCHAR, TEXT, …',
  date: 'DATE, DATETIME, TIMESTAMP, …',
  time: 'TIME',
  boolean: 'BOOLEAN',
  other: 'JSON, ARRAY, STRUCT, GEOGRAPHY, …',
};

/**
 * Human/AI-readable field-type matrix for the query_data_mart tool description.
 * Generated from the same constants the validator enforces — never hand-edit a copy.
 */
export function buildFieldTypeMatrixSection(): string {
  const lines = FIELD_TYPE_CATEGORIES.map(category => {
    let ops = mcpOperatorsForCategory(category).join(', ');
    if (category === 'boolean') ops += ' (eq/neq take a boolean true or false, not a string)';
    const defaults = mcpDefaultAggregationsForCategory(category);
    const optIn = mcpSupportedAggregationsForCategory(category).filter(
      fn => !defaults.includes(fn)
    );
    const aggs =
      optIn.length > 0
        ? `${defaults.join(', ')} by default; ${optIn.join(', ')} only where enabled on the field`
        : defaults.join(', ');
    return `- ${category} (${CATEGORY_TYPE_EXAMPLES[category]}): operators ${ops}; aggregations ${aggs}`;
  });
  return lines.join('\n');
}
