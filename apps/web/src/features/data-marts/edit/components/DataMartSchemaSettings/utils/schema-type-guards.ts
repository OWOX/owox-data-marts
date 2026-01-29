import type {
  AthenaDataMartSchema,
  AthenaSchemaField,
  BigQueryDataMartSchema,
  BigQuerySchemaField,
  DatabricksDataMartSchema,
  DatabricksSchemaField,
  DataMartSchema,
  RedshiftDataMartSchema,
  RedshiftSchemaField,
  SnowflakeDataMartSchema,
  SnowflakeSchemaField,
} from '../../../../shared/types/data-mart-schema.types';

/**
 * Type guard to check if a schema is a BigQuery schema.
 * Replaces runtime type checks using string literals with proper TypeScript type guards.
 */
export function isBigQuerySchema(schema: DataMartSchema): schema is BigQueryDataMartSchema {
  return schema.type === 'bigquery-data-mart-schema';
}

/**
 * Type guard to check if a schema is an Athena schema.
 * Replaces runtime type checks using string literals with proper TypeScript type guards.
 */
export function isAthenaSchema(schema: DataMartSchema): schema is AthenaDataMartSchema {
  return schema.type === 'athena-data-mart-schema';
}

/**
 * Type guard to check if a schema is a Snowflake schema.
 * Replaces runtime type checks using string literals with proper TypeScript type guards.
 */
export function isSnowflakeSchema(schema: DataMartSchema): schema is SnowflakeDataMartSchema {
  return schema.type === 'snowflake-data-mart-schema';
}

/**
 * Type guard to check if a field is a BigQuery field.
 * Uses structural typing to check if the field has a 'mode' property,
 * which is specific to BigQuery fields.
 */
export function isBigQueryField(field: unknown): field is BigQuerySchemaField {
  return field !== null && typeof field === 'object' && 'mode' in field;
}

/**
 * Type guard to check if a field is an Athena field.
 * Uses structural typing to check if the field has a 'isPrimaryKey' property,
 * which is specific to Athena fields.
 */
export function isAthenaField(field: unknown): field is AthenaSchemaField {
  return field !== null && typeof field === 'object' && 'isPrimaryKey' in field;
}

/**
 * Type guard to check if a field is a Snowflake field.
 * Uses structural typing similar to Athena (both have isPrimaryKey).
 */
export function isSnowflakeField(field: unknown): field is SnowflakeSchemaField {
  return (
    field !== null && typeof field === 'object' && 'isPrimaryKey' in field && !('mode' in field)
  );
}

/**
 * Type guard to check if a schema is a Redshift schema.
 * Replaces runtime type checks using string literals with proper TypeScript type guards.
 */
export function isRedshiftSchema(schema: DataMartSchema): schema is RedshiftDataMartSchema {
  return schema.type === 'redshift-data-mart-schema';
}

/**
 * Type guard to check if a field is a Redshift field.
 * Uses structural typing similar to Athena and Snowflake (has isPrimaryKey).
 */
export function isRedshiftField(field: unknown): field is RedshiftSchemaField {
  return (
    field !== null && typeof field === 'object' && 'isPrimaryKey' in field && !('mode' in field)
  );
}

/**
 * Type guard to check if a schema is a Databricks schema.
 * Replaces runtime type checks using string literals with proper TypeScript type guards.
 */
export function isDatabricksSchema(schema: DataMartSchema): schema is DatabricksDataMartSchema {
  return schema.type === 'databricks-data-mart-schema';
}

/**
 * Type guard to check if a field is a Databricks field.
 * Uses structural typing similar to Athena, Snowflake, and Redshift (has isPrimaryKey).
 */
export function isDatabricksField(field: unknown): field is DatabricksSchemaField {
  return (
    field !== null && typeof field === 'object' && 'isPrimaryKey' in field && !('mode' in field)
  );
}
