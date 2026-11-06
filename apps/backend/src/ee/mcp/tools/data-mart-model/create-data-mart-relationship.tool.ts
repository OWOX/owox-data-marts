import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_MODEL_FACADE,
  type McpDataMartModelFacade,
} from '../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { createRelationshipSchema, relationshipOutputSchema } from './data-mart-model.schemas';

const inputSchema = createRelationshipSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class CreateDataMartRelationshipTool implements McpToolDefinition<Input> {
  readonly name = 'create_data_mart_relationship';
  readonly description =
    'Add a relationship between Data Marts in the same Storage. The tool requires editor role and EDIT access to both Data Marts. Use lowercase letters, numbers, and underscores for target_alias. Use exact top-level join field names. Empty join_conditions saves an incomplete relationship that cannot yet be queried.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { relationship: relationshipOutputSchema };
  readonly annotations = {
    title: 'Create Data Mart relationship',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';

  constructor(@Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const actor = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    return jsonToolResult({
      relationship: await this.model.createRelationship(actor, {
        dataMartId: parsed.data_mart_id,
        targetDataMartId: parsed.target_data_mart_id,
        targetAlias: parsed.target_alias,
        description: parsed.description,
        joinConditions: parsed.join_conditions.map(condition => ({
          sourceFieldName: condition.source_field_name,
          targetFieldName: condition.target_field_name,
        })),
      }),
    });
  }
}
