import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  MCP_DESTINATION_TYPES,
  type McpDataDestinationsFacade,
} from '../../../data-marts/facades/mcp-data-destinations.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';

type ListDestinationsInput = Record<string, never>;

@Injectable()
export class ListDestinationsTool implements McpToolDefinition<ListDestinationsInput> {
  readonly name = 'list_destinations';
  readonly description =
    'List destinations in the active OWOX project to target when creating a report.';
  readonly zodSchema = {};
  readonly outputSchema = {
    destinations: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(MCP_DESTINATION_TYPES),
        owner: z.string().nullable(),
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

  private readonly inputSchema = z.object({}).strict();

  constructor(
    @Inject(MCP_DATA_DESTINATIONS_FACADE)
    private readonly destinations: McpDataDestinationsFacade
  ) {}

  parseInput(input: unknown): ListDestinationsInput {
    return this.inputSchema.parse(input);
  }

  async handler(input: ListDestinationsInput, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);

    const result = await this.destinations.listDestinations({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });

    const structuredContent = { destinations: result.destinations };

    return {
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    };
  }
}
