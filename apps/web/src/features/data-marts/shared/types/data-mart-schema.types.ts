/**
 * Data mart schema field status enum
 */
export enum DataMartSchemaFieldStatus {
  CONNECTED = 'CONNECTED',
  CONNECTED_WITH_DEFINITION_MISMATCH = 'CONNECTED_WITH_DEFINITION_MISMATCH',
  DISCONNECTED = 'DISCONNECTED',
}

/**
 * BigQuery field mode enum
 */
export enum BigQueryFieldMode {
  NULLABLE = 'NULLABLE',
  REQUIRED = 'REQUIRED',
  REPEATED = 'REPEATED',
}

/**
 * BigQuery field type enum
 */
export enum BigQueryFieldType {
  // Numeric types
  INTEGER = 'INTEGER',
  INT64 = 'INT64',
  FLOAT = 'FLOAT',
  FLOAT64 = 'FLOAT64',
  NUMERIC = 'NUMERIC',
  BIGNUMERIC = 'BIGNUMERIC',

  // String types
  STRING = 'STRING',

  // Binary types
  BYTES = 'BYTES',

  // Boolean types
  BOOLEAN = 'BOOLEAN',
  BOOL = 'BOOL',

  // Date/Time types
  DATE = 'DATE',
  TIME = 'TIME',
  DATETIME = 'DATETIME',
  TIMESTAMP = 'TIMESTAMP',

  // Geospatial types
  GEOGRAPHY = 'GEOGRAPHY',

  // Complex types
  JSON = 'JSON',
  RECORD = 'RECORD',
  STRUCT = 'STRUCT',
  RANGE = 'RANGE',
}

/**
 * Athena field type enum
 */
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
}

/**
 * Base schema field interface
 */
export interface BaseSchemaField {
  name: string;
  type: string;
  alias?: string;
  description?: string;
  isPrimaryKey: boolean;
  status: DataMartSchemaFieldStatus;
}

/**
 * BigQuery schema field interface
 */
export interface BigQuerySchemaField extends BaseSchemaField {
  type: BigQueryFieldType;
  mode: BigQueryFieldMode;
  fields?: BigQuerySchemaField[];
}

/**
 * Athena schema field interface
 */
export interface AthenaSchemaField extends BaseSchemaField {
  type: AthenaFieldType;
}

/**
 * BigQuery data mart schema
 */
export interface BigQueryDataMartSchema {
  type: 'bigquery-data-mart-schema';
  fields: BigQuerySchemaField[];
}

/**
 * Athena data mart schema
 */
export interface AthenaDataMartSchema {
  type: 'athena-data-mart-schema';
  fields: AthenaSchemaField[];
}

/**
 * Data mart schema type
 */
export type DataMartSchema = BigQueryDataMartSchema | AthenaDataMartSchema;
