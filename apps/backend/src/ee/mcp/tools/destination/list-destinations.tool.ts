import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope, Role } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../../data-marts/facades/mcp-data-destinations.facade';
import { MCP_DESTINATION_TYPES } from '../../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { OwnerFilter } from '../../../../data-marts/enums/owner-filter.enum';
import { DestinationToolMapper, destinationSummaryOutput } from './destination-tool.mapper';
import { destinationToolCall } from './destination-tool-error';

const inputSchema = z
  .object({
    destination_type: z.enum(MCP_DESTINATION_TYPES).optional(),
    owner_filter: z.enum(OwnerFilter).optional(),
    owner_id: z.string().min(1).optional(),
  })
  .strict();

type ListDestinationsInput = z.infer<typeof inputSchema>;

@Injectable()
export class ListDestinationsTool implements McpToolDefinition<ListDestinationsInput> {
  readonly name = 'list_destinations';
  readonly description =
    'List Destinations in the connected project. Filter by type or owner. ' +
    'owner identifies the creator. owners identifies current owners.\n\n' +
    'After creation, use destination_id from add_destination. ' +
    'Without a known ID, match the requested name and connectedGoogleAccount for Google Sheets. ' +
    'Ask the user when several Destinations match. Never select a Destination by createdAt or recency.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { destinations: z.array(z.object(destinationSummaryOutput)) };
  readonly annotations = {
    title: 'List Destinations',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new DestinationToolMapper();

  constructor(
    @Inject(MCP_DATA_DESTINATIONS_FACADE)
    private readonly destinations: McpDataDestinationsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): ListDestinationsInput {
    return inputSchema.parse(input);
  }

  async handler(input: ListDestinationsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await destinationToolCall(() =>
      this.destinations.listDestinations({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        ...(parsed.destination_type !== undefined && { type: parsed.destination_type }),
        ...(parsed.owner_filter !== undefined && { ownerFilter: parsed.owner_filter }),
        ...(parsed.owner_id !== undefined && { ownerId: parsed.owner_id }),
      })
    );
    const publicOrigin = this.publicOriginService.getPublicOrigin();
    return jsonToolResult({
      destinations: result.destinations.map(destination =>
        this.mapper.toSummary(destination, context.projectId, publicOrigin)
      ),
    });
  }
}
