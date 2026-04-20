// Non-joinable (complex) types that should be excluded from join conditions.
// Covers BigQuery, Snowflake, Redshift, Athena, and Databricks.
const COMPLEX_TYPES = new Set([
  // BigQuery
  'RECORD',
  'STRUCT',
  'JSON',
  'RANGE',
  'INTERVAL',
  // Snowflake
  'VARIANT',
  'OBJECT',
  // Athena / Databricks
  'ARRAY',
  'MAP',
  'ROW',
  // Redshift
  'SUPER',
]);

export function isPrimitiveFieldType(type: string): boolean {
  return !COMPLEX_TYPES.has(type.toUpperCase());
}

// Types within the same group are considered compatible for join conditions.
const NUMERIC_TYPES = [
  'INTEGER',
  'INT',
  'INT2',
  'INT4',
  'INT8',
  'INT64',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  'BYTEINT',
  'FLOAT',
  'FLOAT4',
  'FLOAT8',
  'FLOAT64',
  'DOUBLE',
  'DOUBLE PRECISION',
  'REAL',
  'NUMERIC',
  'DECIMAL',
  'DEC',
  'BIGNUMERIC',
  'BIGDECIMAL',
  'NUMBER',
  'FIXED',
];

const NUMERIC_TYPE_SET = new Set(NUMERIC_TYPES);

const TYPE_GROUPS: string[][] = [
  NUMERIC_TYPES,
  ['STRING', 'VARCHAR', 'CHAR', 'TEXT', 'NVARCHAR', 'NCHAR'],
  ['BOOLEAN', 'BOOL'],
  [
    'DATE',
    'TIME',
    'DATETIME',
    'TIMESTAMP',
    'TIMESTAMP_LTZ',
    'TIMESTAMP_NTZ',
    'TIMESTAMP_TZ',
    'TIMESTAMPTZ',
  ],
  ['BYTES', 'BINARY', 'VARBINARY', 'BYTEA'],
];

export function areTypesCompatible(type1: string, type2: string): boolean {
  const upper1 = type1.toUpperCase();
  const upper2 = type2.toUpperCase();

  if (upper1 === upper2) return true;

  for (const group of TYPE_GROUPS) {
    if (group.includes(upper1) && group.includes(upper2)) return true;
  }

  return false;
}

export function isNumericFieldType(type: string): boolean {
  return NUMERIC_TYPE_SET.has(type.toUpperCase());
}
