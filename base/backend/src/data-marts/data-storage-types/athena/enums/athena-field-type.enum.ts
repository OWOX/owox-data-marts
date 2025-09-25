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

export function parseAthenaFieldType(athenaNativeType: string): AthenaFieldType | null {
  // Normalize the input to uppercase
  const normalizedType = athenaNativeType.toUpperCase();

  // Handle basic types that match exactly with enum values
  if (Object.values(AthenaFieldType).includes(normalizedType as AthenaFieldType)) {
    return normalizedType as AthenaFieldType;
  }

  if (athenaNativeType.toLowerCase().startsWith('map<')) {
    return AthenaFieldType.MAP;
  }

  if (athenaNativeType.toLowerCase().startsWith('struct<')) {
    return AthenaFieldType.STRUCT;
  }

  if (athenaNativeType.toLowerCase().startsWith('row<')) {
    return AthenaFieldType.ROW;
  }

  // If we get here, the type is not supported
  return null;
}
