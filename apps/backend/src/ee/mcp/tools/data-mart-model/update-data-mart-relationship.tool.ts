import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_MODEL_FACADE,
  type McpDataMartModelFacade,
} from '../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { updateRelationshipSchema, relationshipOutputSchema } from './data-mart-model.schemas';

const inputSchema = updateRelationshipSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartRelationshipTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_relationship';
  readonly description =
    'Change the alias, join conditions, or business description of an existing relationship. The tool requires editor role and EDIT access to its source Data Mart. The target Data Mart cannot change. Renaming an alias updates the existing field paths and formulas in the source Data Mart. join_conditions replaces all conditions: keep the existing conditions that the user still needs. Empty join_conditions returns the relationship to an incomplete state. A null or blank description clears the saved description.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { relationship: relationshipOutputSchema };
  readonly annotations = {
    title: 'Update Data Mart relationship',
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
    return jsonToolResult({
      relationship: await this.model.updateRelationship(actor, {
        dataMartId: parsed.data_mart_id,
        relationshipId: parsed.relationship_id,
        targetAlias: parsed.target_alias,
        description: parsed.description,
        joinConditions: parsed.join_conditions?.map(condition => ({
          sourceFieldName: condition.source_field_name,
          targetFieldName: condition.target_field_name,
        })),
      }),
    });
  }
}
