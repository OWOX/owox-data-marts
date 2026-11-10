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
  destinationMutationOutput,
} from './destination-tool.mapper';
import { destinationToolCall } from './destination-tool-error';

const inputSchema = destinationIdInput;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class DeleteDestinationTool implements McpToolDefinition<Input> {
  readonly name = 'delete_destination';
  readonly description =
    "Delete a Destination that has no dependent Reports. The saved Credential remains available. Requires permission to delete the Destination. Inspect get_destination_impact first. Never delete dependent Reports to bypass this restriction. Get the user's approval before the call.";
  readonly zodSchema = inputSchema;
  readonly outputSchema = destinationMutationOutput;
  readonly annotations = {
    title: 'Delete Destination',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
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
    const result = await destinationToolCall(
      () => this.destinations.deleteDestination(this.mapper.toActor(context), destination_id),
      'delete'
    );
    return jsonToolResult(
      this.mapper.toMutation(result, context.projectId, this.publicOriginService.getPublicOrigin())
    );
  }
}
