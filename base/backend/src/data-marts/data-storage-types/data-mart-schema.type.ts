import { z } from 'zod';
import { AthenaDataMartSchemaSchema } from './athena/schemas/athena-data-mart-schema.schema';
import { BigQueryDataMartSchemaSchema } from './bigquery/schemas/bigquery-data-mart.schema';

export const DataMartSchemaSchema = z.discriminatedUnion('type', [
  BigQueryDataMartSchemaSchema,
  AthenaDataMartSchemaSchema,
]);

export type DataMartSchema = z.infer<typeof DataMartSchemaSchema>;
