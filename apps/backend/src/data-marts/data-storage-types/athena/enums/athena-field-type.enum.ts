export enum AthenaFieldType {
  // Primitive types
  BOOLEAN = 'BOOLEAN',
  TINYINT = 'TINYINT',
  SMALLINT = 'SMALLINT',
  INTEGER = 'INTEGER',
  BIGINT = 'BIGINT',
  FLOAT = 'FLOAT',
  REAL = 'REAL',
  DOUBLE = 'DOUBLE',
  DECIMAL = 'DECIMAL',

  // String types
  CHAR = 'CHAR',
  VARCHAR = 'VARCHAR',
  STRING = 'STRING',

  // Binary types
  BINARY = 'BINARY',
  VARBINARY = 'VARBINARY',

  // Date/Time types
  DATE = 'DATE',
  TIME = 'TIME',
  TIMESTAMP = 'TIMESTAMP',
  TIME_WITH_TIME_ZONE = 'TIME WITH TIME ZONE',
  TIMESTAMP_WITH_TIME_ZONE = 'TIMESTAMP WITH TIME ZONE',
  INTERVAL_YEAR_TO_MONTH = 'INTERVAL YEAR TO MONTH',
  INTERVAL_DAY_TO_SECOND = 'INTERVAL DAY TO SECOND',

  // Complex types
  ARRAY = 'ARRAY',
  MAP = 'MAP',
  STRUCT = 'STRUCT',
  ROW = 'ROW',
  JSON = 'JSON',

  // Add any other types that might be needed
}

// Precision/scale/length args on scalar types: decimal(10,2), varchar(255),
// char(3), timestamp(3), time(6). Stripped so parameterized spellings still
// match the base enum value. Athena's GetQueryResults metadata usually returns
// base names, but computed/cast columns and engine v3 can emit the full form.
const SCALAR_PRECISION_PATTERN = /\(\s*\d+\s*(?:,\s*\d+\s*)?\)/g;

export function parseAthenaFieldType(athenaNativeType: string): AthenaFieldType | null {
  // Normalize to uppercase and drop scalar precision/scale so e.g.
  // "decimal(10,2)" -> "DECIMAL" and "timestamp(3) with time zone" ->
  // "TIMESTAMP WITH TIME ZONE" still match the enum exactly.
  const normalizedType = athenaNativeType
    .toUpperCase()
    .replace(SCALAR_PRECISION_PATTERN, '')
    .trim();

  // Handle basic types that match exactly with enum values
  if (Object.values(AthenaFieldType).includes(normalizedType as AthenaFieldType)) {
    return normalizedType as AthenaFieldType;
  }

  // Complex/parametric types carry their element types in <...> (Hive spelling)
  // or (...) (Trino spelling), e.g. array<int>, map(varchar,int), row(...).
  // Classify by the head token only — element types don't change filter
  // capability, and mapping them here (rather than falling back to STRING)
  // keeps the validator fail-closed: complex columns then allow only
  // is_null/is_not_null instead of being mistaken for filterable strings.
  const head = normalizedType.split(/[<(]/, 1)[0].trim();
  switch (head) {
    case 'ARRAY':
      return AthenaFieldType.ARRAY;
    case 'MAP':
      return AthenaFieldType.MAP;
    case 'STRUCT':
      return AthenaFieldType.STRUCT;
    case 'ROW':
      return AthenaFieldType.ROW;
    default:
      // If we get here, the type is not supported
      return null;
  }
}
