import { z } from 'zod-v4';
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const modelMutationBase = { dataMartId: z.string().uuid(), expectedRevision: revision };
export const actualizeSchemaInput = z.object(modelMutationBase).strict();
export const updateSchemaInput = z
  .object({
    ...modelMutationBase,
    schema: z
      .object({
        type: z.string().min(1),
        fields: z.array(z.record(z.string(), z.unknown())).max(10000),
      })
      .strict(),
  })
  .strict();
const join = z
  .object({
    sourceFieldName: z
      .string()
      .min(1)
      .regex(/^[^.]+$/),
    targetFieldName: z
      .string()
      .min(1)
      .regex(/^[^.]+$/),
  })
  .strict();
const alias = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9_]+$/);
const override = z
  .object({
    alias: z.string().min(1).max(255).optional(),
    isHidden: z.boolean().optional(),
    aggregateFunction: z
      .enum(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG', 'ANY_VALUE'])
      .optional(),
    postJoinAggregations: z
      .array(
        z.enum([
          'SUM',
          'AVG',
          'MIN',
          'MAX',
          'COUNT',
          'COUNT_DISTINCT',
          'STRING_AGG',
          'ANY_VALUE',
          'P25',
          'P50',
          'P75',
          'P95',
        ])
      )
      .optional(),
  })
  .strict();
export const relationshipsInput = z
  .object({
    ...modelMutationBase,
    changes: z
      .array(
        z.discriminatedUnion('action', [
          z
            .object({
              action: z.literal('create'),
              targetDataMartId: z.string().uuid(),
              targetAlias: alias,
              joinConditions: z.array(join),
              description: z.string().max(10000).optional(),
            })
            .strict(),
          z
            .object({
              action: z.literal('update'),
              relationshipId: z.string().uuid(),
              targetAlias: alias.optional(),
              joinConditions: z.array(join).optional(),
              description: z.string().max(10000).nullable().optional(),
            })
            .strict(),
          z.object({ action: z.literal('remove'), relationshipId: z.string().uuid() }).strict(),
        ])
      )
      .max(100),
    blendedFieldsConfig: z
      .object({
        sources: z
          .array(
            z
              .object({
                path: z
                  .string()
                  .min(1)
                  .max(255)
                  .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/),
                alias: z.string().min(1).max(255),
                isExcluded: z.boolean().optional(),
                description: z.string().trim().min(1).max(10000).optional(),
                fields: z.record(z.string(), override).optional(),
              })
              .strict()
          )
          .max(100),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export const accessInput = z
  .object({
    ...modelMutationBase,
    mode: z.enum(['inspect', 'apply']),
    owners: z
      .object({
        businessOwnerIds: z.array(z.string().min(1)).max(100),
        technicalOwnerIds: z.array(z.string().min(1)).max(100),
      })
      .strict()
      .optional(),
    availability: z
      .object({ availableForReporting: z.boolean(), availableForMaintenance: z.boolean() })
      .strict()
      .optional(),
    impactDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
const audience = z
  .object({
    businessOwnerIds: z.array(z.string()),
    technicalOwnerIds: z.array(z.string()),
    contextIds: z.array(z.string()),
    availableForReporting: z.boolean(),
    availableForMaintenance: z.boolean(),
  })
  .strict();
export const modelMutationOutput = z
  .object({
    state: z.enum(['completed', 'inspection']),
    dataMartId: z.string(),
    revision,
    schema: z
      .object({
        inputRevision: z.number().int().nonnegative().nullable(),
        freshness: z.enum(['current', 'stale', 'missing']),
      })
      .strict()
      .optional(),
    warnings: z
      .array(
        z
          .object({
            code: z.string(),
            message: z.string(),
            field: z.string(),
            subject: z.string().optional(),
          })
          .strict()
      )
      .optional(),
    impactDigest: z.string().optional(),
    currentAudience: audience.optional(),
    proposedAudience: audience.optional(),
  })
  .strict();
