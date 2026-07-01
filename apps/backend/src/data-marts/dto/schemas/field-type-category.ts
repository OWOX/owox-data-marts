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
