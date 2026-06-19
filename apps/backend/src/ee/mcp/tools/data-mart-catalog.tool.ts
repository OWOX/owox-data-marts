import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';

type ListDataMartsInput = Record<string, never>;

@Injectable()
export class ListDataMartsTool implements McpToolDefinition<ListDataMartsInput> {
  readonly name = 'list_data_marts';
  readonly description = 'List data marts available to the current OWOX project member.';
  readonly zodSchema = {};
  readonly outputSchema = {
    data_marts: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        status: z.string(),
        updated_at: z.string(),
      })
    ),
  };
  readonly annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  private readonly inputSchema = z.object({}).strict();

  constructor(
    @Inject(MCP_DATA_MARTS_FACADE)
    private readonly dataMarts: McpDataMartsFacade
  ) {}

  parseInput(input: unknown): ListDataMartsInput {
    return this.inputSchema.parse(input);
  }

  async handler(input: ListDataMartsInput, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);

    const result = await this.dataMarts.listDataMarts({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });

    const structuredContent = {
      data_marts: result.dataMarts.map(dataMart => ({
        id: dataMart.id,
        title: dataMart.title,
        description: dataMart.description ?? '',
        status: dataMart.status,
        updated_at: dataMart.updatedAt,
      })),
    };

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
