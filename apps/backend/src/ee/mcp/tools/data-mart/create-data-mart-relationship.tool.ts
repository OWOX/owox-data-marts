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
    target_data_mart_id: z.string().min(1),
    target_alias: dataMartRelationshipAliasSchema,
    join_conditions: dataMartRelationshipJoinConditionsSchema,
    description: z.string().optional(),
  })
  .strict();

type CreateDataMartRelationshipInput = z.infer<typeof inputSchema>;

@Injectable()
export class CreateDataMartRelationshipTool implements McpToolDefinition<CreateDataMartRelationshipInput> {
  readonly name = 'create_data_mart_relationship';
  readonly description =
    'Create a relationship from data_mart_id to target_data_mart_id in the connected project. Requires an editor role and EDIT access to both Data Marts. Both must use the same storage; self-references and duplicate source aliases are rejected. join_conditions uses top-level column names; an empty array saves a draft relationship. description is optional business context for the join.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { relationship: makeDataMartRelationshipOutputSchema() };
  readonly annotations = {
    title: 'Create Data Mart Relationship',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_RELATIONSHIPS_FACADE)
    private readonly relationships: McpDataMartRelationshipsFacade
  ) {}

  parseInput(input: unknown): CreateDataMartRelationshipInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: CreateDataMartRelationshipInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const { data_mart_id, target_data_mart_id, target_alias, join_conditions, description } =
      this.parseInput(input);
    const relationship = await this.relationships.createRelationship({
      dataMartId: data_mart_id,
      targetDataMartId: target_data_mart_id,
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
