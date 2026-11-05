import { z } from 'zod';
import {
  ALIAS_SEGMENT_REGEX,
  MCP_MODEL_PREVIEW_DEFAULT_LIMIT,
  MCP_MODEL_PREVIEW_MAX_LIMIT,
} from '../../../../data-marts/facades/mcp-data-mart-model.facade';

const idSchema = z.string().min(1).max(255);
const aliasSchema = z.string().min(1).max(255).regex(ALIAS_SEGMENT_REGEX);
const joinConditionSchema = z
  .object({
    source_field_name: z
      .string()
      .min(1)
      .regex(/^[^.]+$/, 'Use a top-level source field name.'),
    target_field_name: z
      .string()
      .min(1)
      .regex(/^[^.]+$/, 'Use a top-level target field name.'),
  })
  .strict();
export const dataMartTargetSchema = z.object({ data_mart_id: idSchema }).strict();
export const relationshipTargetSchema = dataMartTargetSchema.extend({ relationship_id: idSchema });
export const createRelationshipSchema = dataMartTargetSchema.extend({
  target_data_mart_id: idSchema,
  target_alias: aliasSchema,
  join_conditions: z
    .array(joinConditionSchema)
    .max(100)
    .describe(
      'Use top-level join fields. An empty array saves an incomplete relationship. Configure it before querying the blend.'
    ),
  description: z.string().max(10000).optional(),
});
export const updateRelationshipSchema = relationshipTargetSchema
  .extend({
    target_alias: aliasSchema.optional(),
    join_conditions: z.array(joinConditionSchema).max(100).optional(),
    description: z
      .string()
      .max(10000)
      .nullable()
      .optional()
      .describe('Omit description to keep its saved value. Null or a blank string clears it.'),
  })
  .refine(
    value =>
      value.target_alias !== undefined ||
      value.join_conditions !== undefined ||
      value.description !== undefined,
    'Supply at least one relationship change.'
  );
export const previewDataMartSchema = dataMartTargetSchema.extend({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MCP_MODEL_PREVIEW_MAX_LIMIT)
    .default(MCP_MODEL_PREVIEW_DEFAULT_LIMIT),
});

const dataMartRefSchema = z.object({
  id: z.string(),
  userHasAccess: z.boolean(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  hasPrimaryKey: z.boolean().optional(),
});
export const relationshipOutputSchema = z.object({
  id: z.string(),
  dataStorageId: z.string(),
  sourceDataMart: dataMartRefSchema,
  targetDataMart: dataMartRefSchema,
  targetAlias: z.string(),
  description: z.string().optional(),
  joinConditions: z.array(z.object({ sourceFieldName: z.string(), targetFieldName: z.string() })),
  createdAt: z.string(),
  modifiedAt: z.string(),
});
export const graphOutputSchema = {
  rootDataMartId: z.string(),
  nodes: z.array(
    z.object({
      relationship: relationshipOutputSchema,
      aliasPath: z.string(),
      depth: z.number().int(),
      isCycleStub: z.boolean(),
      isBlocked: z.boolean(),
    })
  ),
};
export const previewOutputSchema = {
  columns: z.array(
    z.object({ name: z.string(), alias: z.string().optional(), type: z.string().optional() })
  ),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  rowCount: z.number().int(),
  limit: z.number().int(),
  truncated: z.boolean(),
};
