import { z } from 'zod';
import { AthenaDataMartSchemaSchema } from './athena/schemas/athena-data-mart-schema.schema';
import { BigQueryDataMartSchemaSchema } from './bigquery/schemas/bigquery-data-mart.schema';
import { SnowflakeDataMartSchemaSchema } from './snowflake/schemas/snowflake-data-mart-schema.schema';
import { RedshiftDataMartSchemaSchema } from './redshift/schemas/redshift-data-mart-schema.schema';

export const DataMartSchemaSchema = z.discriminatedUnion('type', [
  BigQueryDataMartSchemaSchema,
  AthenaDataMartSchemaSchema,
  SnowflakeDataMartSchemaSchema,
  RedshiftDataMartSchemaSchema,
]);

export type DataMartSchema = z.infer<typeof DataMartSchemaSchema>;
