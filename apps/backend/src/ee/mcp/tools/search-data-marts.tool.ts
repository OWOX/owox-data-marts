import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  SEARCH_FACADE,
  type SearchFacade,
  SearchableEntityType,
} from '../../../common/search/search.facade';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import {
  MCP_PROJECT_CONTEXT_FACADE,
  type McpProjectContextFacade,
} from '../../../idp/facades/mcp-project-context.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildDataMartUiPath } from './data-mart-ui-path';
import { gettingStartedSchema, resolveGettingStarted } from './mcp-getting-started.util';
import { tryGetMcpProjectSummary } from './mcp-project-summary.util';
import { joinPublicOrigin } from './mcp-public-url.util';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const inputSchema = z
  .object({
    prompt: z.string().trim().min(2).max(256),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  })
  .strict();

type SearchDataMartsInput = z.infer<typeof inputSchema>;

@Injectable()
export class SearchDataMartsTool implements McpToolDefinition<SearchDataMartsInput> {
  readonly name = 'get_relevant_data_marts_by_prompt';
  readonly description =
    'Find relevant non-draft data marts in the current OWOX project from a natural-language prompt, limited to data marts visible to the current MCP user. This is the default discovery step for a concrete analytical question when the data mart has not already been confirmed. Use it when the user asks to find, discover, or search published data marts by title, description, business meaning, schema fields, or metrics. This tool returns only data marts, not data storages or destinations, and it intentionally excludes draft data marts.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    project: z.object({ id: z.string(), title: z.string() }).optional(),
    data_marts: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        url: z.string(),
        relevance_score: z.number(),
      })
    ),
    getting_started: gettingStartedSchema
      .optional()
      .describe(
        'Present only when the user sees no published data mart at all (not when the search simply found nothing): links and next steps for creating the first one. Relay its instructions instead of rephrasing the search.'
      ),
  };
  readonly annotations = {
    title: 'Find Relevant Data Marts by Prompt',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(SEARCH_FACADE)
    private readonly searchFacade: SearchFacade,
    private readonly publicOriginService: PublicOriginService,
    @Inject(MCP_PROJECT_CONTEXT_FACADE)
    private readonly projectContext: McpProjectContextFacade,
    @Inject(MCP_DATA_MARTS_FACADE)
    private readonly dataMarts: McpDataMartsFacade
  ) {}

  parseInput(input: unknown): SearchDataMartsInput {
    return inputSchema.parse(input);
  }

  async handler(input: SearchDataMartsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const [results, projectContext] = await Promise.all([
      this.searchFacade.search(context.projectId, parsed.prompt, {
        topK: parsed.limit ?? DEFAULT_LIMIT,
        entityTypes: [SearchableEntityType.DATA_MART],
        excludeDrafts: true,
        accessScope: {
          userId: context.userId,
          roles: context.roles,
        },
      }),
      tryGetMcpProjectSummary(this.projectContext, context),
    ]);

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const dataMarts = results
      .filter(result => result.entityType === SearchableEntityType.DATA_MART)
      .map(result => ({
        id: result.entityId,
        title: result.title,
        description: result.description ?? '',
        url: joinPublicOrigin(
          publicOrigin,
          buildDataMartUiPath(context.projectId, result.entityId)
        ),
        relevance_score: result.finalScore,
      }));
    // An empty search result is ambiguous: nothing matched, or there is nothing to match. Only
    // the latter deserves onboarding guidance, so the catalog itself is checked before guiding.
    const gettingStarted =
      dataMarts.length === 0
        ? await resolveGettingStarted({ dataMarts: this.dataMarts, publicOrigin }, context)
        : undefined;
    const structuredContent = {
      ...(projectContext ? { project: projectContext } : {}),
      data_marts: dataMarts,
      ...(gettingStarted ? { getting_started: gettingStarted } : {}),
    };

    return jsonToolResult(structuredContent);
  }
}
