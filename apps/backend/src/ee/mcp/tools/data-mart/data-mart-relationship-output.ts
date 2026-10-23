import { z } from 'zod-v4';

const makeDataMartRefSchema = () =>
  z
    .object({
      id: z.string(),
      userHasAccess: z.boolean().describe('False means all metadata except id is withheld.'),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
      hasPrimaryKey: z.boolean().optional(),
    })
    .describe('Data Mart reference. Only id and userHasAccess are returned when access is denied.');

export const makeDataMartRelationshipOutputSchema = () =>
  z.object({
    id: z.string(),
    dataStorageId: z.string(),
    sourceDataMart: makeDataMartRefSchema(),
    targetDataMart: makeDataMartRefSchema(),
    targetAlias: z.string().describe('Target alias used in join paths and qualified field names.'),
    joinConditions: z
      .array(z.object({ sourceFieldName: z.string(), targetFieldName: z.string() }))
      .describe(
        'Source/target top-level column pairs. Empty means a draft relationship without join keys.'
      ),
    description: z.string().optional().describe('Business meaning of the join when provided.'),
    createdById: z.string(),
    createdAt: z.string().datetime(),
    modifiedAt: z.string().datetime(),
    createdByUser: z
      .object({
        userId: z.string(),
        fullName: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        avatar: z.string().nullable().optional(),
      })
      .nullable(),
  });

export const makeDataMartRelationshipGraphNodeSchema = () =>
  z.object({
    relationship: makeDataMartRelationshipOutputSchema(),
    aliasPath: z
      .string()
      .describe('Dot-separated relationship alias path from the requested root Data Mart.'),
    depth: z
      .number()
      .int()
      .min(1)
      .describe('Join depth from the root; direct relationships have depth 1.'),
    isCycleStub: z
      .boolean()
      .describe('Traversal stopped here because this relationship revisits an ancestor.'),
    isBlocked: z
      .boolean()
      .describe(
        'Cumulative flag: an ancestor Data Mart is DRAFT or an ancestor relationship has no join conditions configured.'
      ),
  });
