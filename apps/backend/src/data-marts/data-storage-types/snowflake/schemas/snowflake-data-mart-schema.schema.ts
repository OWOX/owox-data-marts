import { z } from 'zod';
import { createBaseFieldSchemaForType } from '../../data-mart-schema.utils';
import { SnowflakeFieldType } from '../enums/snowflake-field-type.enum';

export const SnowflakeDataMartSchemaType = 'snowflake-data-mart-schema';
export const SnowflakeDataMartSchemaSchema = z.object({
  type: z.literal(SnowflakeDataMartSchemaType),
  fields: z.array(createRecursiveSnowflakeFieldSchema()),
});

export type SnowflakeDataMartSchema = z.infer<typeof SnowflakeDataMartSchemaSchema>;

function createRecursiveSnowflakeFieldSchema() {
  const recursiveSchema = createBaseFieldSchemaForType(
    z.nativeEnum(SnowflakeFieldType).describe('Valid Snowflake field type required')
  ).extend({
    get fields() {
      return z.array(recursiveSchema).optional().describe('Nested fields for complex types');
    },
  });
  return recursiveSchema;
}
