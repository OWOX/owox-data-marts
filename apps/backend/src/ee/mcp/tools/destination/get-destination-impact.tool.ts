import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../../data-marts/facades/mcp-data-destinations.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { DestinationToolMapper, destinationIdInput } from './destination-tool.mapper';
import { destinationToolCall } from './destination-tool-error';

const inputSchema = destinationIdInput;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetDestinationImpactTool implements McpToolDefinition<Input> {
  readonly name = 'get_destination_impact';
  readonly description =
    'Count Reports and Data Marts that depend on a Destination. Requires permission to delete the Destination.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = {
    destination_id: z.string(),
    reports_count: z.number().int().nonnegative(),
    data_mart_count: z.number().int().nonnegative(),
  };
  readonly annotations = {
    title: 'Get Destination Impact',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new DestinationToolMapper();

  constructor(
    @Inject(MCP_DATA_DESTINATIONS_FACADE) private readonly destinations: McpDataDestinationsFacade
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const { destination_id } = this.parseInput(input);
    const result = await destinationToolCall(() =>
      this.destinations.getDestinationImpact(this.mapper.toActor(context), destination_id)
    );
    return jsonToolResult({
      destination_id: result.destinationId,
      reports_count: result.reportsCount,
      data_mart_count: result.dataMartCount,
    });
  }
}
