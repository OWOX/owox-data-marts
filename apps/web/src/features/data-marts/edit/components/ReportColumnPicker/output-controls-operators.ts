export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'is_null'
  | 'is_not_null'
  | 'regex'
  | 'not_regex'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'between'
  | 'is_true'
  | 'is_false'
  | 'relative_date';

export interface OperatorMeta {
  value: FilterOperator;
  label: string;
  shortLabel: string;
}

// Mirror of backend OutputControlsValidatorService type sets — cover every type
// name each supported provider emits (BigQuery + Athena + Redshift), keep in sync.
const STRING_TYPES = new Set(['STRING', 'VARCHAR', 'CHAR', 'TEXT', 'BPCHAR']);
const NUMBER_TYPES = new Set([
  'INTEGER',
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
const DATE_TYPES = new Set([
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE',
  'TIMESTAMPTZ',
]);
// Time-of-day types are kept out of DATE_TYPES: relative_date presets resolve to
// calendar dates (current_date / date_add), which are meaningless for a column
// with no date component and rejected by the backend renderer.
const TIME_TYPES = new Set(['TIME', 'TIME WITH TIME ZONE', 'TIMETZ']);
const BOOL_TYPES = new Set(['BOOLEAN', 'BOOL']);

const STRING_OPERATORS: OperatorMeta[] = [
  { value: 'eq', label: 'is', shortLabel: '=' },
  { value: 'neq', label: 'is not', shortLabel: '≠' },
  { value: 'contains', label: 'contains', shortLabel: '⊃' },
  { value: 'not_contains', label: "doesn't contain", shortLabel: '⊅' },
  { value: 'starts_with', label: 'starts with', shortLabel: '↦' },
  { value: 'ends_with', label: 'ends with', shortLabel: '↤' },
  { value: 'is_empty', label: 'is empty', shortLabel: '∅' },
  { value: 'is_not_empty', label: 'is not empty', shortLabel: '¬∅' },
  { value: 'is_null', label: 'is null', shortLabel: '∅?' },
  { value: 'is_not_null', label: 'is not null', shortLabel: '¬∅?' },
  { value: 'regex', label: 'matches regex', shortLabel: '/.../' },
  { value: 'not_regex', label: "doesn't match regex", shortLabel: '!/.../' },
];

const NUMBER_OPERATORS: OperatorMeta[] = [
  { value: 'eq', label: 'equals', shortLabel: '=' },
  { value: 'neq', label: 'not equals', shortLabel: '≠' },
  { value: 'gt', label: 'greater than', shortLabel: '>' },
  { value: 'lt', label: 'less than', shortLabel: '<' },
  { value: 'gte', label: 'greater than or equal', shortLabel: '≥' },
  { value: 'lte', label: 'less than or equal', shortLabel: '≤' },
  { value: 'between', label: 'between', shortLabel: 'X..Y' },
  { value: 'is_null', label: 'is null', shortLabel: '∅' },
  { value: 'is_not_null', label: 'is not null', shortLabel: '¬∅' },
];

const DATE_OPERATORS: OperatorMeta[] = [
  { value: 'eq', label: 'on', shortLabel: '=' },
  { value: 'neq', label: 'not on', shortLabel: '≠' },
  { value: 'gt', label: 'after', shortLabel: '>' },
  { value: 'lt', label: 'before', shortLabel: '<' },
  { value: 'gte', label: 'on or after', shortLabel: '≥' },
  { value: 'lte', label: 'on or before', shortLabel: '≤' },
  { value: 'between', label: 'between', shortLabel: 'X..Y' },
  { value: 'relative_date', label: 'relative', shortLabel: '⏱' },
  { value: 'is_null', label: 'is null', shortLabel: '∅' },
  { value: 'is_not_null', label: 'is not null', shortLabel: '¬∅' },
];

const BOOLEAN_OPERATORS: OperatorMeta[] = [
  { value: 'is_true', label: 'is true', shortLabel: '✓' },
  { value: 'is_false', label: 'is false', shortLabel: '✗' },
  { value: 'is_null', label: 'is null', shortLabel: '∅' },
  { value: 'is_not_null', label: 'is not null', shortLabel: '¬∅' },
];

// Same comparison operators as dates minus relative_date (calendar-only presets).
// "at"-framed labels read naturally for a time of day, which has no calendar date
// to be "on" / "on or after".
const TIME_LABEL_OVERRIDES: Partial<Record<FilterOperator, string>> = {
  eq: 'at',
  neq: 'not at',
  gte: 'at or after',
  lte: 'at or before',
};
const TIME_OPERATORS: OperatorMeta[] = DATE_OPERATORS.filter(o => o.value !== 'relative_date').map(
  o => {
    const label = TIME_LABEL_OVERRIDES[o.value];
    return label ? { ...o, label } : o;
  }
);

export function operatorsForType(fieldType: string): OperatorMeta[] {
  if (STRING_TYPES.has(fieldType)) return STRING_OPERATORS;
  if (NUMBER_TYPES.has(fieldType)) return NUMBER_OPERATORS;
  if (DATE_TYPES.has(fieldType)) return DATE_OPERATORS;
  if (TIME_TYPES.has(fieldType)) return TIME_OPERATORS;
  if (BOOL_TYPES.has(fieldType)) return BOOLEAN_OPERATORS;
  return [];
}

export function isFilterableType(fieldType: string): boolean {
  return operatorsForType(fieldType).length > 0;
}

// Shared so FilterValueEditor parses values with the SAME type sets — a number
// column must emit a JS number, not a string (Athena quotes strings, breaking a
// `bigint > '10'` comparison); a date column keeps its string for the backend cast.
export function isNumberType(fieldType: string): boolean {
  return NUMBER_TYPES.has(fieldType);
}

export function isDateType(fieldType: string): boolean {
  return DATE_TYPES.has(fieldType);
}

export function isTimeType(fieldType: string): boolean {
  return TIME_TYPES.has(fieldType);
}

export function operatorLabelFor(operator: FilterOperator, fieldType: string): string {
  const meta = operatorsForType(fieldType).find(o => o.value === operator);
  return meta?.label ?? operator;
}
