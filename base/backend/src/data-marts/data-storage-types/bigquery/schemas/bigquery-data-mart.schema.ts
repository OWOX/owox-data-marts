import { z } from 'zod';
import { createBaseFieldSchemaForType } from '../../data-mart-schema.utils';
import { BigQueryFieldMode } from '../enums/bigquery-field-mode.enum';
import { BigQueryFieldType } from '../enums/bigquery-field-type.enum';

export const BigQueryDataMartSchemaType = 'bigquery-data-mart-schema';
export const BigQueryDataMartSchemaSchema = z.object({
  type: z.literal(BigQueryDataMartSchemaType),
  fields: z.array(createRecursiveBigqueryFieldSchema()),
});

export type BigqueryDataMartSchema = z.infer<typeof BigQueryDataMartSchemaSchema>;

function createRecursiveBigqueryFieldSchema() {
  const recursiveSchema = createBaseFieldSchemaForType(
    z.nativeEnum(BigQueryFieldType).describe('Valid BigQuery field type required')
  ).extend({
    mode: z.nativeEnum(BigQueryFieldMode).describe('The field mode'),
    get fields() {
      return z.array(recursiveSchema).optional().describe('Nested fields for complex types');
    },
  });
  return recursiveSchema;
}
