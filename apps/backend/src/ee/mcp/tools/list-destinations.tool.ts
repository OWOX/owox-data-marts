import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../data-marts/facades/mcp-data-destinations.facade';
import { MCP_DESTINATION_TYPES } from '../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildDataDestinationsUiPath } from './data-mart-ui-path';
import { joinPublicOrigin } from './mcp-public-url.util';

const inputSchema = z.object({}).strict();

type ListDestinationsInput = z.infer<typeof inputSchema>;

@Injectable()
export class ListDestinationsTool implements McpToolDefinition<ListDestinationsInput> {
  readonly name = 'list_destinations';
  readonly description =
    'List destinations in the active OWOX project for report delivery. ' +
    'When add_destination creates a destination, use its returned destination_id. ' +
    'The initial Google Sheets Credential setup call creates no destination. Follow its instructions to create the destination.\n\n' +
    'For an existing Google Sheets destination without a known ID, match the expected connectedGoogleAccount. ' +
    'If several entries match, ask the user which destination they mean. ' +
    'Never select a destination by createdAt or recency. Someone else may create a destination at the same time.\n\n' +
    'Destinations created through add_destination start unshared. The creator can use them in their own reports immediately. ' +
    'Other project members need permission to use them. A user can share a destination through Configure destination → Sharing. ' +
    'This tool does not report sharing status. ' +
    'For a report used by another project member, confirm with the user that the destination is shared.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    destinations: z.array(
      z.object({
        id: z.string(),
        url: z.string().describe('Open this destination in OWOX.'),
        name: z.string(),
        type: z.enum(MCP_DESTINATION_TYPES),
        owner: z.string().nullable(),
        connectedGoogleAccount: z
          .string()
          .nullable()
          .optional()
          .describe(
            'For google_sheets, this is the Google account that completed OAuth consent. ' +
              'Use it to identify an existing destination when its ID is unknown. ' +
              'If several entries match the expected account, ask the user which destination they mean.'
          ),
        createdAt: z
          .string()
          .describe(
            'ISO 8601 timestamp for information only. Do not use it to select a Google Sheets destination. ' +
              'Someone else may create a destination at the same time.'
          ),
      })
    ),
  };
  readonly annotations = {
    title: 'List Destinations',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_DATA_DESTINATIONS_FACADE)
    private readonly destinations: McpDataDestinationsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): ListDestinationsInput {
    return inputSchema.parse(input);
  }

  async handler(input: ListDestinationsInput, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);

    const result = await this.destinations.listDestinations({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const structuredContent = {
      destinations: result.destinations.map(destination => ({
        ...destination,
        url: joinPublicOrigin(
          publicOrigin,
          buildDataDestinationsUiPath(context.projectId, destination.id)
        ),
      })),
    };

    return jsonToolResult(structuredContent);
  }
}
