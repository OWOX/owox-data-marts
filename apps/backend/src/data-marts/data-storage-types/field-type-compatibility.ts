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
const TYPE_GROUPS: string[][] = [
  // Numeric
  [
    'INTEGER',
    'INT',
    'INT64',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'FLOAT',
    'FLOAT64',
    'DOUBLE',
    'REAL',
    'NUMERIC',
    'DECIMAL',
    'BIGNUMERIC',
    'NUMBER',
  ],
  // String
  ['STRING', 'VARCHAR', 'CHAR', 'TEXT', 'NVARCHAR', 'NCHAR'],
  // Boolean
  ['BOOLEAN', 'BOOL'],
  // Date/Time
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
  // Binary
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
