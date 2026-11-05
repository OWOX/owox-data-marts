import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../../data-marts/facades/mcp-data-destinations.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  DestinationToolMapper,
  destinationIdInput,
  destinationDetailsOutput,
} from './destination-tool.mapper';
import { destinationToolCall } from './destination-tool-error';

const inputSchema = destinationIdInput;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetDestinationTool implements McpToolDefinition<Input> {
  readonly name = 'get_destination';
  readonly description =
    'Read a Destination, its sharing settings, and its safe Credential state. Requires permission to see the Destination.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = destinationDetailsOutput;
  readonly annotations = {
    title: 'Get Destination',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new DestinationToolMapper();

  constructor(
    @Inject(MCP_DATA_DESTINATIONS_FACADE) private readonly destinations: McpDataDestinationsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const { destination_id } = this.parseInput(input);
    const result = await destinationToolCall(() =>
      this.destinations.getDestination(this.mapper.toActor(context), destination_id)
    );
    return jsonToolResult(
      this.mapper.toDetails(result, context.projectId, this.publicOriginService.getPublicOrigin())
    );
  }
}
