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
    available_for_reporting: z.boolean(),
    available_for_maintenance: z.boolean(),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartAvailabilityTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_availability';
  readonly description =
    'Configure Data Mart sharing for reporting and maintenance. Both booleans replace their current settings. Existing owner, role, and Context restrictions still apply. Requires permission to configure sharing, as in the API.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { data_mart_id: z.string(), status: z.literal('updated') };
  readonly annotations = {
    title: 'Update Data Mart Availability',
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
    await this.facade.updateDataMartAvailability(ctx, {
      dataMartId: parsed.data_mart_id,
      availableForReporting: parsed.available_for_reporting,
      availableForMaintenance: parsed.available_for_maintenance,
    });
    return jsonToolResult({ data_mart_id: parsed.data_mart_id, status: 'updated' });
  }
}
