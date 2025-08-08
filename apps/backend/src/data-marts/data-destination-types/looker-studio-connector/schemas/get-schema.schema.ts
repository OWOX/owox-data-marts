import { z } from 'zod';
import { FieldDataType } from '../enums/field-data-type.enum';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { AggregationType } from '../enums/aggregation-type.enum';
import { FieldSemanticGroup } from '../enums/field-semantic-group.enum';
import { FieldSemanticType } from '../enums/field-semantic-type.enum';
import { ConnectionConfigSchema } from './connection-config.schema';
import { ConnectorRequestConfigV1Schema } from './connector-request-config.schema.v1';

// Schema for data field
export const SchemaFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  dataType: z.nativeEnum(FieldDataType),
  semantics: z
    .object({
      conceptType: z.nativeEnum(FieldConceptType),
      semanticType: z.nativeEnum(FieldSemanticType).optional(),
      semanticGroup: z.nativeEnum(FieldSemanticGroup).optional(),
      isReaggregatable: z.boolean().optional(),
    })
    .optional(),
  defaultAggregationType: z.nativeEnum(AggregationType).optional(),
  isDefault: z.boolean().optional(),
});

// Schema for getSchema request
export const GetSchemaRequestSchema = z.object({
  connectionConfig: ConnectionConfigSchema,
  request: z.object({
    configParams: ConnectorRequestConfigV1Schema.optional(),
    fields: z
      .array(
        z.object({
          name: z.string(),
        })
      )
      .optional(),
  }),
});

// Schema for getSchema response
export const GetSchemaResponseSchema = z.object({
  schema: z.array(SchemaFieldSchema),
});

export type SchemaField = z.infer<typeof SchemaFieldSchema>;
export type GetSchemaRequest = z.infer<typeof GetSchemaRequestSchema>;
export type GetSchemaResponse = z.infer<typeof GetSchemaResponseSchema>;
