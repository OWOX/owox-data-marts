// Storage-agnostic categorization of schema field types. Shared by the output-controls
// validator (operator/function legality) and the aggregation-governance resolver so the
// two can never drift apart on what counts as a number/string/date/time/boolean.

export const STRING_TYPES = new Set(['STRING', 'VARCHAR', 'CHAR', 'TEXT', 'BPCHAR']);
export const NUMBER_TYPES = new Set([
  'INTEGER',
  'INT',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  'FLOAT',
  'REAL',
  'DOUBLE',
  'DOUBLE PRECISION',
  'NUMERIC',
  'BIGNUMERIC',
  'DECIMAL',
]);
export const DATE_TYPES = new Set([
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE',
  'TIMESTAMPTZ',
  'TIMESTAMP_NTZ',
]);
// Time-of-day types are kept separate from DATE/TIMESTAMP: relative_date renders
// `current_date` / `date_add(..., current_date)` predicates that are meaningless
// (and rejected by Trino) for a column with no date component.
export const TIME_TYPES = new Set(['TIME', 'TIME WITH TIME ZONE', 'TIMETZ']);
export const BOOL_TYPES = new Set(['BOOLEAN', 'BOOL']);

export type FieldTypeCategory = 'number' | 'string' | 'date' | 'time' | 'boolean' | 'other';

export function categorizeFieldType(fieldType: string): FieldTypeCategory {
  if (NUMBER_TYPES.has(fieldType)) return 'number';
  if (STRING_TYPES.has(fieldType)) return 'string';
  if (DATE_TYPES.has(fieldType)) return 'date';
  if (TIME_TYPES.has(fieldType)) return 'time';
  if (BOOL_TYPES.has(fieldType)) return 'boolean';
  return 'other';
}

// ---------------------------------------------------------------------------
// Internal filter operators legal per category. Pure schema-level data (keyed on
// the categories above), so it lives here rather than in the validator service:
// the validator enforces it via `operatorAllowed`, and the MCP layer derives its
// advertised operator matrix from the same map — one source, no service import.
// ---------------------------------------------------------------------------

/** Valid for any column type, including ones not in the category sets. */
export const TYPE_AGNOSTIC_OPS: ReadonlySet<string> = new Set(['is_null', 'is_not_null']);

const STRING_OPS = new Set([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
  'is_empty',
  'is_not_empty',
  'is_null',
  'is_not_null',
  'regex',
  'not_regex',
]);
const NUMBER_OPS = new Set([
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'between',
  'in',
  'not_in',
  'is_null',
  'is_not_null',
]);
const DATE_OPS = new Set([
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'between',
  'in',
  'not_in',
  'relative_date',
  'is_null',
  'is_not_null',
]);
// Same comparison ops as DATE_OPS minus relative_date (date-arithmetic presets).
const TIME_OPS = new Set([
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'between',
  'in',
  'not_in',
  'is_null',
  'is_not_null',
]);
const BOOL_OPS = new Set(['is_true', 'is_false', 'is_null', 'is_not_null']);

export const INTERNAL_OPERATORS_BY_CATEGORY: Record<FieldTypeCategory, ReadonlySet<string>> = {
  string: STRING_OPS,
  number: NUMBER_OPS,
  date: DATE_OPS,
  time: TIME_OPS,
  boolean: BOOL_OPS,
  other: TYPE_AGNOSTIC_OPS,
};
