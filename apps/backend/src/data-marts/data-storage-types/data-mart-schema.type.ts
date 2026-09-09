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
export type DataMartSchemaField = DataMartSchema['fields'][number];

type KnownKey<Key> = string extends Key
  ? never
  : number extends Key
    ? never
    : symbol extends Key
      ? never
      : Key;

type WithoutConnectionStatus<T> = T extends readonly unknown[]
  ? { [Index in keyof T]: WithoutConnectionStatus<T[Index]> }
  : T extends object
    ? {
        [Key in keyof T as Key extends 'status' ? never : KnownKey<Key>]: WithoutConnectionStatus<
          T[Key]
        >;
      }
    : T;

export type DataMartSchemaUpdate = WithoutConnectionStatus<z.input<typeof DataMartSchemaSchema>>;
