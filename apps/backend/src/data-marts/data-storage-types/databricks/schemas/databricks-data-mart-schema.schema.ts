import { z } from 'zod';
import { DatabricksFieldType } from '../enums/databricks-field-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { REPORT_AGGREGATE_FUNCTIONS } from '../../../dto/schemas/aggregate-function.schema';

const DatabricksSchemaFieldSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(DatabricksFieldType),
  isPrimaryKey: z.boolean().optional(),
  isHiddenForReporting: z
    .boolean()
    .default(false)
    .describe('Hide field from reporting and blending'),
  aggregationRole: z
    .enum(['dimension', 'metric'])
    .optional()
    .describe('Whether this field acts as a grouping dimension or an aggregatable metric'),
  allowedAggregations: z
    .array(z.enum(REPORT_AGGREGATE_FUNCTIONS))
    .optional()
    .describe(
      'Aggregation functions a report may apply to this field; absent = derive defaults by type'
    ),
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
