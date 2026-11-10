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
export class RotateDestinationSecretKeyTool implements McpToolDefinition<Input> {
  readonly name = 'rotate_destination_secret_key';
  readonly description =
    'Rotate the Looker Studio Destination key. Each call invalidates the current key. Ask the user to copy the replacement key from the returned Destination URL. Before the call, explain that the old key stops working immediately.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = destinationMutationOutput;
  readonly annotations = {
    title: 'Rotate Destination Secret Key',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
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
    const value = this.parseInput(input);
    const result = await destinationToolCall(() =>
      this.destinations.rotateDestinationSecretKey(
        this.mapper.toActor(context),
        value.destination_id
      )
    );
    return jsonToolResult(
      this.mapper.toMutation(result, context.projectId, this.publicOriginService.getPublicOrigin())
    );
  }
}
