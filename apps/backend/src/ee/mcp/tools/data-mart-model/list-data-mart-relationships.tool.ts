import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_MODEL_FACADE,
  type McpDataMartModelFacade,
} from '../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { dataMartTargetSchema, graphOutputSchema } from './data-mart-model.schemas';

const inputSchema = dataMartTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ListDataMartRelationshipsTool implements McpToolDefinition<Input> {
  readonly name = 'list_data_mart_relationships';
  readonly description =
    'Read the outgoing relationship graph of a Data Mart, including draft and unconfigured joins. The result omits inaccessible relationships and their descendants. Paths identify nested joins. Nested output keys use the camelCase format of the relationship HTTP API.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = graphOutputSchema;
  readonly annotations = {
    title: 'List Data Mart relationships',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  constructor(@Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const actor = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    return jsonToolResult({ ...(await this.model.listRelationships(actor, parsed.data_mart_id)) });
  }
}
