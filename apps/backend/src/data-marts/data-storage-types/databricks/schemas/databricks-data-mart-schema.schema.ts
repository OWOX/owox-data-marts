import { z } from 'zod';
import { DatabricksFieldType } from '../enums/databricks-field-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';

const DatabricksSchemaFieldSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(DatabricksFieldType),
  isPrimaryKey: z.boolean().optional(),
  description: z.string().optional(),
  alias: z.string().optional(),
  status: z.nativeEnum(DataMartSchemaFieldStatus),
});

export const DatabricksDataMartSchemaType = 'databricks-data-mart-schema';

export const DatabricksDataMartSchemaSchema = z.object({
  type: z.literal(DatabricksDataMartSchemaType),
  table: z.string(),
  fields: z.array(DatabricksSchemaFieldSchema),
});

export type DatabricksSchemaField = z.infer<typeof DatabricksSchemaFieldSchema>;
export type DatabricksDataMartSchema = z.infer<typeof DatabricksDataMartSchemaSchema>;
