import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MART_RELATIONSHIPS_FACADE,
  type McpDataMartRelationshipsFacade,
} from '../../../../data-marts/facades/mcp-data-mart-relationships.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z
  .object({
    data_mart_id: z.string().min(1),
    relationship_id: z.string().min(1),
  })
  .strict();

type DeleteDataMartRelationshipInput = z.infer<typeof inputSchema>;

@Injectable()
export class DeleteDataMartRelationshipTool implements McpToolDefinition<DeleteDataMartRelationshipInput> {
  readonly name = 'delete_data_mart_relationship';
  readonly description =
    'Delete a relationship owned by data_mart_id in the connected project. Requires an editor role and EDIT access to the source Data Mart. The join stops being available and existing report caches are invalidated. Reports or calculated fields that depend on this relationship may need to be updated.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    relationship_id: z.string(),
    status: z.literal('deleted'),
  };
  readonly annotations = {
    title: 'Delete Data Mart Relationship',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_RELATIONSHIPS_FACADE)
    private readonly relationships: McpDataMartRelationshipsFacade
  ) {}

  parseInput(input: unknown): DeleteDataMartRelationshipInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: DeleteDataMartRelationshipInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const { data_mart_id, relationship_id } = this.parseInput(input);
    await this.relationships.deleteRelationship({
      dataMartId: data_mart_id,
      relationshipId: relationship_id,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });
    return jsonToolResult({ relationship_id, status: 'deleted' });
  }
}
