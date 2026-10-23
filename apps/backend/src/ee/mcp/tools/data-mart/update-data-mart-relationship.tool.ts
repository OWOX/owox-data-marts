import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MART_RELATIONSHIPS_FACADE,
  type McpDataMartRelationshipsFacade,
} from '../../../../data-marts/facades/mcp-data-mart-relationships.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  dataMartRelationshipAliasSchema,
  dataMartRelationshipJoinConditionsSchema,
} from './data-mart-relationship-input';
import { makeDataMartRelationshipOutputSchema } from './data-mart-relationship-output';

const inputSchema = z
  .object({
    data_mart_id: z.string().min(1),
    relationship_id: z.string().min(1),
    target_alias: dataMartRelationshipAliasSchema.optional(),
    join_conditions: dataMartRelationshipJoinConditionsSchema.optional(),
    description: z
      .string()
      .nullable()
      .optional()
      .describe('Omit to keep the description; send null or a blank string to clear it.'),
  })
  .strict();

type UpdateDataMartRelationshipInput = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartRelationshipTool implements McpToolDefinition<UpdateDataMartRelationshipInput> {
  readonly name = 'update_data_mart_relationship';
  readonly description =
    'Update a relationship owned by data_mart_id in the connected project. Requires an editor role and EDIT access to the source Data Mart. Omitted fields stay unchanged; description null or blank clears it. Renaming target_alias updates source field paths and calculated formulas. Empty join_conditions saves a draft relationship. Existing report caches are invalidated.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { relationship: makeDataMartRelationshipOutputSchema() };
  readonly annotations = {
    title: 'Update Data Mart Relationship',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_RELATIONSHIPS_FACADE)
    private readonly relationships: McpDataMartRelationshipsFacade
  ) {}

  parseInput(input: unknown): UpdateDataMartRelationshipInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: UpdateDataMartRelationshipInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const { data_mart_id, relationship_id, target_alias, join_conditions, description } =
      this.parseInput(input);
    const relationship = await this.relationships.updateRelationship({
      dataMartId: data_mart_id,
      relationshipId: relationship_id,
      targetAlias: target_alias,
      joinConditions: join_conditions,
      description,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });
    return jsonToolResult({ relationship });
  }
}
