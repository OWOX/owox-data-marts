export enum AthenaFieldType {
  // Primitive types
  BOOLEAN = 'boolean',
  TINYINT = 'tinyint',
  SMALLINT = 'smallint',
  INTEGER = 'integer',
  BIGINT = 'bigint',
  REAL = 'real',
  DOUBLE = 'double',
  DECIMAL = 'decimal',

  // String types
  CHAR = 'char',
  VARCHAR = 'varchar',
  STRING = 'string',

  // Binary types
  BINARY = 'binary',
  VARBINARY = 'varbinary',

  // Date/Time types
  DATE = 'date',
  TIME = 'time',
  TIMESTAMP = 'timestamp',
  TIME_WITH_TIME_ZONE = 'time with time zone',
  TIMESTAMP_WITH_TIME_ZONE = 'timestamp with time zone',
  INTERVAL_YEAR_TO_MONTH = 'interval year to month',
  INTERVAL_DAY_TO_SECOND = 'interval day to second',

  // Complex types
  ARRAY = 'array',
  MAP = 'map',
  STRUCT = 'struct',
  ROW = 'row',
  JSON = 'json',

  // Add any other types that might be needed
}

export function parseAthenaFieldType(athenaNativeType: string): AthenaFieldType {
  // Handle basic types that match exactly with enum values
  if (Object.values(AthenaFieldType).includes(athenaNativeType as AthenaFieldType)) {
    return athenaNativeType as AthenaFieldType;
  }

  if (athenaNativeType.startsWith('map<')) {
    return AthenaFieldType.MAP;
  }

  if (athenaNativeType.startsWith('struct<')) {
    return AthenaFieldType.STRUCT;
  }

  if (athenaNativeType.startsWith('row<')) {
    return AthenaFieldType.ROW;
  }

  // If we get here, the type is not supported
  throw new Error(`Unsupported Athena type: ${athenaNativeType}`);
}
