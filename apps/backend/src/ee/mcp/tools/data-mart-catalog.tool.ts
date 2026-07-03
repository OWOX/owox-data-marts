import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildDataMartUiPath, joinPublicOrigin } from './data-mart-ui-path';

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
        url: z.string(),
        status: z.string(),
        updated_at: z.string(),
      })
    ),
  };
  readonly annotations = {
    title: 'List Data Marts',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  private readonly inputSchema = z.object({}).strict();

  constructor(
    @Inject(MCP_DATA_MARTS_FACADE)
    private readonly dataMarts: McpDataMartsFacade,
    private readonly publicOriginService: PublicOriginService
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

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const structuredContent = {
      data_marts: result.dataMarts.map(dataMart => ({
        id: dataMart.id,
        title: dataMart.title,
        description: dataMart.description ?? '',
        url: joinPublicOrigin(publicOrigin, buildDataMartUiPath(context.projectId, dataMart.id)),
        status: dataMart.status,
        updated_at: dataMart.updatedAt,
      })),
    };

    return jsonToolResult(structuredContent);
  }
}
