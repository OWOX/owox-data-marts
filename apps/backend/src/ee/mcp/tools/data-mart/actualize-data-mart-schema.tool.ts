import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  dataMartTargetShape,
  dataMartConfigurationOutput,
} from './data-mart-configuration.schemas';
const inputSchema = z.object({ ...dataMartTargetShape }).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ActualizeDataMartSchemaTool implements McpToolDefinition<Input> {
  readonly name = 'actualize_data_mart_schema';
  readonly description =
    'Refresh the Data Mart schema from its saved source definition and warehouse, using the same operation as schema actualization in the UI. Waits for completion and returns the updated configuration. Requires editor or admin and edit access; the warehouse and storage credentials must be available.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = dataMartConfigurationOutput;
  readonly annotations = {
    title: 'Actualize Data Mart Schema',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
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
    const result = await this.facade.actualizeDataMartSchema(ctx, {
      dataMartId: parsed.data_mart_id,
    });
    return jsonToolResult({ data_mart: result });
  }
}
