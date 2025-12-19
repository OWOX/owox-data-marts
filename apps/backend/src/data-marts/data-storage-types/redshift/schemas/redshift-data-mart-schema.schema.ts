import { z } from 'zod';
import { createBaseFieldSchemaForType } from '../../data-mart-schema.utils';
import { RedshiftFieldType } from '../enums/redshift-field-type.enum';

export const RedshiftDataMartSchemaType = 'redshift-data-mart-schema';

export const RedshiftDataMartSchemaFieldSchema = createBaseFieldSchemaForType(
  z.nativeEnum(RedshiftFieldType).describe('Valid Redshift field type required')
);

export const RedshiftDataMartSchemaSchema = z.object({
  type: z.literal(RedshiftDataMartSchemaType),
  fields: z.array(RedshiftDataMartSchemaFieldSchema),
});

export type RedshiftDataMartSchemaField = z.infer<typeof RedshiftDataMartSchemaFieldSchema>;
export type RedshiftDataMartSchema = z.infer<typeof RedshiftDataMartSchemaSchema>;
