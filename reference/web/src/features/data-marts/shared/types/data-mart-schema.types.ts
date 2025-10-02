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
  FLOAT = 'FLOAT',
  NUMERIC = 'NUMERIC',
  BIGNUMERIC = 'BIGNUMERIC',

  // String types
  STRING = 'STRING',

  // Binary types
  BYTES = 'BYTES',

  // Boolean types
  BOOLEAN = 'BOOLEAN',

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
  INTERVAL = 'INTERVAL',
}

/**
 * Athena field type enum
 */
export enum AthenaFieldType {
  // Primitive types
  BOOLEAN = 'BOOLEAN',
  TINYINT = 'TINYINT',
  SMALLINT = 'SMALLINT',
  INTEGER = 'INTEGER',
  BIGINT = 'BIGINT',
  REAL = 'REAL',
  FLOAT = 'FLOAT',
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
