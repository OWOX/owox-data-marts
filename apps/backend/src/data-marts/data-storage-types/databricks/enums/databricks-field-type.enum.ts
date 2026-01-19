export enum DatabricksFieldType {
  // String types
  STRING = 'STRING',
  VARCHAR = 'VARCHAR',
  CHAR = 'CHAR',

  // Numeric types
  TINYINT = 'TINYINT',
  SMALLINT = 'SMALLINT',
  INT = 'INT',
  BIGINT = 'BIGINT',
  FLOAT = 'FLOAT',
  DOUBLE = 'DOUBLE',
  DECIMAL = 'DECIMAL',

  // Date/Time types
  DATE = 'DATE',
  TIMESTAMP = 'TIMESTAMP',
  TIMESTAMP_NTZ = 'TIMESTAMP_NTZ',

  // Boolean
  BOOLEAN = 'BOOLEAN',

  // Complex types
  ARRAY = 'ARRAY',
  STRUCT = 'STRUCT',
  MAP = 'MAP',

  // Binary
  BINARY = 'BINARY',

  // Other
  INTERVAL = 'INTERVAL',
}
