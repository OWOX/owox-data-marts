import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../data-marts/facades/mcp-data-destinations.facade';
import { MCP_DESTINATION_TYPES } from '../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z.object({}).strict();

type ListDestinationsInput = z.infer<typeof inputSchema>;

@Injectable()
export class ListDestinationsTool implements McpToolDefinition<ListDestinationsInput> {
  readonly name = 'list_destinations';
  readonly description =
    'List destinations in the active OWOX project to target when creating a report. ' +
    'Also the only way to learn the destination_id and connected Google account for a ' +
    'google_sheets destination just created via add_destination, since that call does ' +
    'not return an id synchronously — see its description. When matching that destination, ' +
    'never pick by createdAt/recency — someone else may create a destination at the same ' +
    'time, so the newest entry is not reliably the right one. Filter by connectedGoogleAccount ' +
    'matching who the user expected instead; if exactly one entry matches, use it, and if ' +
    'more than one still matches, ask the user which one they mean rather than guessing. ' +
    'Destinations created via add_destination start unshared: the creator can use them ' +
    'in their own reports right away, but other project members cannot until a human ' +
    'shares them (Configure destination → Sharing) — this tool does not report sharing ' +
    "status, so if the report is for someone other than the destination's creator, " +
    'confirm with the user that it has been shared rather than assuming it.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    destinations: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(MCP_DESTINATION_TYPES),
        owner: z.string().nullable(),
        connectedGoogleAccount: z
          .string()
          .nullable()
          .optional()
          .describe(
            'For google_sheets destinations: the Google account that completed OAuth ' +
              'consent. This is the field to match on when identifying a destination just ' +
              'created via add_destination. If more than one google_sheets entry matches ' +
              'the expected account, ask the user which one they mean instead of guessing.'
          ),
        createdAt: z
          .string()
          .describe(
            'ISO 8601 timestamp, informational only. Do not use it to pick between ' +
              'candidate google_sheets destinations — someone else may create one at the ' +
              'same time, so the newest entry is not reliably the right one. Its `name` ' +
              'cannot be predicted in advance; the user sets it in the form.'
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
    private readonly destinations: McpDataDestinationsFacade
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

    const structuredContent = { destinations: result.destinations };

    return jsonToolResult(structuredContent);
  }
}
