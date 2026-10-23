import { z } from 'zod-v4';
import { MCP_DATA_MART_RELATIONSHIP_ALIAS_REGEX } from '../../../../data-marts/facades/mcp-data-mart-relationships.facade';

export const dataMartRelationshipAliasSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(MCP_DATA_MART_RELATIONSHIP_ALIAS_REGEX)
  .describe('Alias containing only lowercase letters, numbers, and underscores.');

export const dataMartRelationshipJoinConditionsSchema = z
  .array(
    z
      .object({
        sourceFieldName: z
          .string()
          .min(1)
          .regex(/^[^.]+$/)
          .describe(
            'Top-level column name in the source Data Mart. Nested dotted paths are not supported.'
          ),
        targetFieldName: z
          .string()
          .min(1)
          .regex(/^[^.]+$/)
          .describe(
            'Top-level column name in the target Data Mart. Nested dotted paths are not supported.'
          ),
      })
      .strict()
  )
  .describe(
    'Join key pairs using top-level column names. An empty array saves a draft relationship.'
  );
