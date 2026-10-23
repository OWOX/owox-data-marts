import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MART_RELATIONSHIPS_FACADE,
  type McpDataMartRelationshipsFacade,
} from '../../../../data-marts/facades/mcp-data-mart-relationships.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { makeDataMartRelationshipGraphNodeSchema } from './data-mart-relationship-output';

const inputSchema = z.object({ data_mart_id: z.string().min(1) }).strict();

type GetDataMartRelationshipGraphInput = z.infer<typeof inputSchema>;

@Injectable()
export class GetDataMartRelationshipGraphTool implements McpToolDefinition<GetDataMartRelationshipGraphInput> {
  readonly name = 'get_data_mart_relationship_graph';
  readonly description =
    'Get the transitive relationship graph rooted at data_mart_id in the connected project. Requires a viewer role and SEE access to the root Data Mart. Nodes include alias paths, depth, cycle stubs, and blocked-ancestor flags. Inaccessible Data Mart references include only their ID and userHasAccess=false; their titles, descriptions, status and primary-key metadata are omitted.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    root_data_mart_id: z.string(),
    nodes: z.array(makeDataMartRelationshipGraphNodeSchema()),
  };
  readonly annotations = {
    title: 'Get Data Mart Relationship Graph',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_DATA_MART_RELATIONSHIPS_FACADE)
    private readonly relationships: McpDataMartRelationshipsFacade
  ) {}

  parseInput(input: unknown): GetDataMartRelationshipGraphInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: GetDataMartRelationshipGraphInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const { data_mart_id } = this.parseInput(input);
    const graph = await this.relationships.getRelationshipGraph({
      dataMartId: data_mart_id,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });
    return jsonToolResult({ root_data_mart_id: graph.rootDataMartId, nodes: graph.nodes });
  }
}
