import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_MODEL_FACADE,
  type McpDataMartModelFacade,
} from '../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { previewDataMartSchema, previewOutputSchema } from './data-mart-model.schemas';

const inputSchema = previewDataMartSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class PreviewDataMartTool implements McpToolDefinition<Input> {
  readonly name = 'preview_data_mart';
  readonly description =
    'Read a small sample of native visible fields from a draft or published Data Mart. The sample uses its saved definition and Output Schema. The warehouse query can create or replace an OWOX-managed technical view. The tool requires viewer role, data access, and write scope. The limit is 1-100 rows, with a default of 20.\n\nThis tool does not publish the Data Mart, save a new definition, add Run History, or consume OWOX credits. Warehouse query costs may apply. If the Output Schema has no visible fields, refresh it first. The sample does not include calculated fields or select joined fields.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = previewOutputSchema;
  readonly annotations = {
    title: 'Preview Data Mart',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';

  constructor(@Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade) {}

  async handler(
    input: Input,
    context: McpAuthContext,
    signal?: AbortSignal
  ): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const actor = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    return jsonToolResult({
      ...(await this.model.preview(actor, parsed.data_mart_id, parsed.limit, signal)),
    });
  }
}
