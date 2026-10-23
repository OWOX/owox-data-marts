import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { dataMartTargetShape } from './data-mart-configuration.schemas';
const inputSchema = z
  .object({
    ...dataMartTargetShape,
    context_ids: z
      .array(z.string().min(1))
      .max(100)
      .describe(
        'Complete replacement list of Context IDs from list_contexts. Empty removes all Context assignments; preserve IDs that should remain.'
      ),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartContextsTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_contexts';
  readonly description =
    'Replace all Context assignments of a Data Mart with context_ids from list_contexts. Pass an empty array to remove all Context assignments. This can change access for project members. Requires admin or a technical owner with editor role, matching the API.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { data_mart_id: z.string(), status: z.literal('updated') };
  readonly annotations = {
    title: 'Update Data Mart Contexts',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    await this.facade.updateDataMartContexts(ctx, {
      dataMartId: parsed.data_mart_id,
      contextIds: parsed.context_ids,
    });
    return jsonToolResult({ data_mart_id: parsed.data_mart_id, status: 'updated' });
  }
}
