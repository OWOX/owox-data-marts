import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_PROJECT_CONTEXT_FACADE,
  type McpProjectContextFacade,
} from '../../../idp/facades/mcp-project-context.facade';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildDataMartUiPath } from './data-mart-ui-path';
import { tryGetMcpProjectSummary } from './mcp-project-summary.util';
import { joinPublicOrigin } from './mcp-public-url.util';

const inputSchema = z
  .object({
    status: z
      .enum(['published', 'draft'])
      .optional()
      .describe(
        'Catalog state filter. Defaults to published. Draft returns draft metadata only; only published Data Marts can be inspected or queried through MCP.'
      ),
  })
  .strict();

type ListDataMartsInput = z.infer<typeof inputSchema>;

@Injectable()
export class ListDataMartsTool implements McpToolDefinition<ListDataMartsInput> {
  readonly name = 'list_data_marts';
  readonly description =
    'List data marts available to the current OWOX project member. Defaults to published data marts; use status=draft only to browse draft metadata, because other MCP data-mart tools accept published data marts only. Use only when the user explicitly asks to list or browse data marts; for a concrete analytical question use get_relevant_data_marts_by_prompt instead, and for open-ended orientation use summarize_data_catalog.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    project: z.object({ id: z.string(), title: z.string() }).optional(),
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

  constructor(
    @Inject(MCP_DATA_MARTS_FACADE)
    private readonly dataMarts: McpDataMartsFacade,
    private readonly publicOriginService: PublicOriginService,
    @Inject(MCP_PROJECT_CONTEXT_FACADE)
    private readonly projectContext: McpProjectContextFacade
  ) {}

  parseInput(input: unknown): ListDataMartsInput {
    return inputSchema.parse(input);
  }

  async handler(input: ListDataMartsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);

    const [result, projectContext] = await Promise.all([
      this.dataMarts.listDataMarts({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        status: parsed.status ?? 'published',
      }),
      tryGetMcpProjectSummary(this.projectContext, context),
    ]);

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const structuredContent = {
      ...(projectContext ? { project: projectContext } : {}),
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
