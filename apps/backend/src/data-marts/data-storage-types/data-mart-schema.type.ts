import { z } from 'zod';
import { AthenaDataMartSchemaSchema } from './athena/schemas/athena-data-mart-schema.schema';
import { BigQueryDataMartSchemaSchema } from './bigquery/schemas/bigquery-data-mart.schema';
import { SnowflakeDataMartSchemaSchema } from './snowflake/schemas/snowflake-data-mart-schema.schema';
import { RedshiftDataMartSchemaSchema } from './redshift/schemas/redshift-data-mart-schema.schema';
import { DatabricksDataMartSchemaSchema } from './databricks/schemas/databricks-data-mart-schema.schema';

export const DataMartSchemaSchema = z.discriminatedUnion('type', [
  BigQueryDataMartSchemaSchema,
  AthenaDataMartSchemaSchema,
  SnowflakeDataMartSchemaSchema,
  RedshiftDataMartSchemaSchema,
  DatabricksDataMartSchemaSchema,
]);

export type DataMartSchema = z.infer<typeof DataMartSchemaSchema>;
// The loose field schema's index signature would otherwise keep flat field types in `'fields' in field`.
type WithoutIndexSignature<T> = T extends unknown
  ? { [K in keyof T as string extends K ? never : K]: T[K] }
  : never;
export type DataMartSchemaField = WithoutIndexSignature<DataMartSchema['fields'][number]>;

export type DataMartSchemaUpdate = z.input<typeof DataMartSchemaSchema>;
