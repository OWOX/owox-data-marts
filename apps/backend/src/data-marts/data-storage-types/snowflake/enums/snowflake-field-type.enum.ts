/**
 * Snowflake field types
 */
export enum SnowflakeFieldType {
  // Numeric types
  INTEGER = 'INTEGER',
  FLOAT = 'FLOAT',
  NUMERIC = 'NUMERIC',

  // String types
  STRING = 'STRING',

  // Binary types
  BYTES = 'BYTES',

  // Boolean types
  BOOLEAN = 'BOOLEAN',

  // Date/Time types
  DATE = 'DATE',
  TIME = 'TIME',
  TIMESTAMP = 'TIMESTAMP',

  // Geospatial types
  GEOGRAPHY = 'GEOGRAPHY',

  // Complex types
  VARIANT = 'VARIANT',
}

export function parseSnowflakeFieldType(snowflakeNativeType: string): SnowflakeFieldType | null {
  const normalizedType = snowflakeNativeType.toUpperCase();

  // Handle Snowflake types
  switch (normalizedType) {
    // Numeric types
    case 'NUMBER':
    case 'DECIMAL':
    case 'DEC':
    case 'FIXED':
      return SnowflakeFieldType.NUMERIC;
    case 'INT':
    case 'INTEGER':
    case 'BIGINT':
    case 'SMALLINT':
    case 'TINYINT':
    case 'BYTEINT':
      return SnowflakeFieldType.INTEGER;
    case 'FLOAT':
    case 'FLOAT4':
    case 'FLOAT8':
    case 'DOUBLE':
    case 'DOUBLE PRECISION':
    case 'REAL':
      return SnowflakeFieldType.FLOAT;

    // String types
    case 'VARCHAR':
    case 'CHAR':
    case 'CHARACTER':
    case 'STRING':
    case 'TEXT':
      return SnowflakeFieldType.STRING;

    // Binary types
    case 'BINARY':
    case 'VARBINARY':
      return SnowflakeFieldType.BYTES;

    // Boolean types
    case 'BOOLEAN':
    case 'BOOL':
      return SnowflakeFieldType.BOOLEAN;

    // Date/Time types
    case 'DATE':
      return SnowflakeFieldType.DATE;
    case 'TIME':
      return SnowflakeFieldType.TIME;
    case 'DATETIME':
    case 'TIMESTAMP':
    case 'TIMESTAMP_LTZ':
    case 'TIMESTAMP_NTZ':
    case 'TIMESTAMP_TZ':
      return SnowflakeFieldType.TIMESTAMP;

    // Geospatial types
    case 'GEOGRAPHY':
    case 'GEOMETRY':
      return SnowflakeFieldType.GEOGRAPHY;

    // Complex types
    case 'VARIANT':
    case 'OBJECT':
    case 'ARRAY':
      return SnowflakeFieldType.VARIANT;
  }

  return null;
}
