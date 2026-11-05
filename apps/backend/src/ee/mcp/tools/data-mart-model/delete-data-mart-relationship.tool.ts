import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_MODEL_FACADE,
  type McpDataMartModelFacade,
} from '../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { relationshipTargetSchema } from './data-mart-model.schemas';

const inputSchema = relationshipTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class DeleteDataMartRelationshipTool implements McpToolDefinition<Input> {
  readonly name = 'delete_data_mart_relationship';
  readonly description =
    'Delete a relationship from its source Data Mart. The tool requires editor role and EDIT access to the source Data Mart. Existing Reports and formulas that reference its alias may need changes.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = {
    data_mart_id: z.string(),
    relationship_id: z.string(),
    deleted: z.boolean(),
  };
  readonly annotations = {
    title: 'Delete Data Mart relationship',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';

  constructor(@Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const actor = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    await this.model.deleteRelationship(actor, parsed.data_mart_id, parsed.relationship_id);
    return jsonToolResult({
      data_mart_id: parsed.data_mart_id,
      relationship_id: parsed.relationship_id,
      deleted: true,
    });
  }
}
