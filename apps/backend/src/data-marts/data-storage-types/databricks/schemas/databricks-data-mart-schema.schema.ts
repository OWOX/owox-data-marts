import { z } from 'zod';
import { createBaseFieldSchemaForType } from '../../data-mart-schema.utils';
import { DatabricksFieldType } from '../enums/databricks-field-type.enum';

export const DatabricksDataMartSchemaType = 'databricks-data-mart-schema';

// Was a hand-rolled duplicate of createBaseFieldSchemaForType's shape; switched to the shared
// helper so every field-level addition (e.g. `calculated`) reaches Databricks too, instead of
// silently drifting out of sync with the other four storages.
export const DatabricksSchemaFieldSchema = createBaseFieldSchemaForType(
  z.nativeEnum(DatabricksFieldType).describe('Valid Databricks field type required')
);

export const DatabricksDataMartSchemaSchema = z.object({
  type: z.literal(DatabricksDataMartSchemaType),
  table: z.string(),
  fields: z.array(DatabricksSchemaFieldSchema),
});

export type DatabricksSchemaField = z.infer<typeof DatabricksSchemaFieldSchema>;
export type DatabricksDataMartSchema = z.infer<typeof DatabricksDataMartSchemaSchema>;
