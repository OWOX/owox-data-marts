import { z } from 'zod';
import { createBaseFieldSchemaForType } from '../../data-mart-schema.utils';
import { AthenaFieldType } from '../enums/athena-field-type.enum';

export const AthenaDataMartSchemaType = 'athena-data-mart-schema';
export const AthenaDataMartSchemaSchema = z.object({
  type: z.literal(AthenaDataMartSchemaType),
  fields: z.array(
    createBaseFieldSchemaForType(
      z.nativeEnum(AthenaFieldType).describe('Valid Athena field type required')
    )
  ),
});

export type AthenaDataMartSchema = z.infer<typeof AthenaDataMartSchemaSchema>;
