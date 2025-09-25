import {
  AthenaDataMartSchema,
  AthenaDataMartSchemaSchema,
} from './athena/schemas/athena-data-mart-schema.schema';
import {
  BigqueryDataMartSchema,
  BigQueryDataMartSchemaSchema,
} from './bigquery/schemas/bigquery-data-mart.schema';

export function isBigQueryDataMartSchema(schema: unknown): schema is BigqueryDataMartSchema {
  return BigQueryDataMartSchemaSchema.safeParse(schema).success;
}

export function isAthenaDataMartSchema(schema: unknown): schema is AthenaDataMartSchema {
  return AthenaDataMartSchemaSchema.safeParse(schema).success;
}
