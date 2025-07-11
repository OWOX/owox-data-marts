import { z } from 'zod';
import { createBaseFieldSchemaForType } from '../../data-mart-schema.utils';

export const AthenaDataMartSchemaType = 'athena-data-mart-schema';
export const AthenaDataMartSchemaSchema = z.object({
  type: z.literal(AthenaDataMartSchemaType),
  fields: z.array(
    createBaseFieldSchemaForType(z.string().min(1).describe('Valid Athena field type required'))
  ),
});

export type AthenaDataMartSchema = z.infer<typeof AthenaDataMartSchemaSchema>;
