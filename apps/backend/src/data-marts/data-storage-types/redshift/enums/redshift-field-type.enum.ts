export enum RedshiftFieldType {
  // Numeric types
  SMALLINT = 'SMALLINT',
  INTEGER = 'INTEGER',
  BIGINT = 'BIGINT',
  DECIMAL = 'DECIMAL',
  NUMERIC = 'NUMERIC',
  REAL = 'REAL',
  DOUBLE_PRECISION = 'DOUBLE PRECISION',

  // String types
  VARCHAR = 'VARCHAR',
  CHAR = 'CHAR',
  TEXT = 'TEXT',
  BPCHAR = 'BPCHAR',

  // Boolean
  BOOLEAN = 'BOOLEAN',
  BOOL = 'BOOL',

  // Date/Time types
  DATE = 'DATE',
  TIMESTAMP = 'TIMESTAMP',
  TIMESTAMPTZ = 'TIMESTAMPTZ',
  TIME = 'TIME',
  TIMETZ = 'TIMETZ',

  // Binary
  BYTEA = 'BYTEA',

  // Complex types
  SUPER = 'SUPER', // JSON-like semi-structured data

  // Geometric (rarely used)
  GEOMETRY = 'GEOMETRY',
  GEOGRAPHY = 'GEOGRAPHY',
}

/**
 * Parses Redshift native type string to RedshiftFieldType enum
 * Handles type aliases and variations
 */
export function parseRedshiftFieldType(redshiftNativeType: string): RedshiftFieldType | null {
  const normalized = redshiftNativeType.toUpperCase().trim();

  if (Object.values(RedshiftFieldType).includes(normalized as RedshiftFieldType)) {
    return normalized as RedshiftFieldType;
  }

  if (normalized.startsWith('DOUBLE PRECISION') || normalized === 'FLOAT8') {
    return RedshiftFieldType.DOUBLE_PRECISION;
  }
  if (normalized.startsWith('REAL') || normalized === 'FLOAT4') {
    return RedshiftFieldType.REAL;
  }
  if (normalized.startsWith('CHARACTER VARYING')) {
    return RedshiftFieldType.VARCHAR;
  }
  if (normalized.startsWith('CHARACTER') || normalized === 'BPCHAR') {
    return RedshiftFieldType.CHAR;
  }
  if (normalized.startsWith('INT') || normalized === 'INT4' || normalized === 'INT') {
    return RedshiftFieldType.INTEGER;
  }
  if (normalized === 'INT2') {
    return RedshiftFieldType.SMALLINT;
  }
  if (normalized === 'INT8') {
    return RedshiftFieldType.BIGINT;
  }
  if (normalized.startsWith('TIMESTAMP WITH TIME ZONE')) {
    return RedshiftFieldType.TIMESTAMPTZ;
  }
  if (normalized.startsWith('TIME WITH TIME ZONE')) {
    return RedshiftFieldType.TIMETZ;
  }
  if (normalized.startsWith('NUMERIC')) {
    return RedshiftFieldType.NUMERIC;
  }
  if (normalized.startsWith('DECIMAL')) {
    return RedshiftFieldType.DECIMAL;
  }

  return null; // Unknown type
}
