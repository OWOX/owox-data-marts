import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  SEARCH_FACADE,
  type SearchFacade,
  SearchableEntityType,
} from '../../../common/search/search.facade';
import { DataDestinationType } from '../../../data-marts/data-destination-types/enums/data-destination-type.enum';
import {
  MCP_DESTINATION_TYPES,
  toMcpDestinationType,
} from '../../../data-marts/facades/mcp-destination-type';
import {
  MCP_PROJECT_CONTEXT_FACADE,
  type McpProjectContextFacade,
} from '../../../idp/facades/mcp-project-context.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { tryGetMcpProjectSummary } from './mcp-project-summary.util';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const inputSchema = z
  .object({
    prompt: z.string().trim().min(2).max(256),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  })
  .strict();

type SearchReportsInput = z.infer<typeof inputSchema>;

@Injectable()
export class SearchReportsTool implements McpToolDefinition<SearchReportsInput> {
  readonly name = 'get_relevant_reports_by_prompt';
  readonly description =
    'Find existing reports in the current OWOX project from a natural-language prompt, limited to reports whose data mart is visible to the current MCP user. Matches the report name first, then the data mart and destination names. Use it when the user refers to a report by name or subject and its id is not yet known — to open, rerun, change, or schedule it; each result carries the report id, its data mart and destination, and a direct link. Use get_data_mart_reports instead when the data mart is already known and you need every report with its full definition.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    project: z.object({ id: z.string(), title: z.string() }).optional(),
    reports: z.array(
      z.object({
        report_id: z.string(),
        title: z.string(),
        data_mart: z.object({ id: z.string(), title: z.string() }),
        destination: z.object({
          id: z.string(),
          title: z.string(),
          type: z.enum(MCP_DESTINATION_TYPES),
        }),
        relevance_score: z.number(),
        url: z.string().describe('Open this report in OWOX.'),
      })
    ),
  };
  readonly annotations = {
    title: 'Find Relevant Reports by Prompt',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(SEARCH_FACADE)
    private readonly searchFacade: SearchFacade,
    @Inject(MCP_PROJECT_CONTEXT_FACADE)
    private readonly projectContext: McpProjectContextFacade
  ) {}

  parseInput(input: unknown): SearchReportsInput {
    return inputSchema.parse(input);
  }

  async handler(input: SearchReportsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const [results, project] = await Promise.all([
      this.searchFacade.search(context.projectId, parsed.prompt, {
        topK: parsed.limit ?? DEFAULT_LIMIT,
        entityTypes: [SearchableEntityType.REPORT],
        accessScope: { userId: context.userId, roles: context.roles },
      }),
      tryGetMcpProjectSummary(this.projectContext, context),
    ]);

    const reports = results.flatMap(result => {
      if (result.entityType !== SearchableEntityType.REPORT || !result.report || !result.url) {
        return [];
      }
      const { dataMart, dataDestination } = result.report;
      return [
        {
          report_id: result.entityId,
          title: result.title,
          data_mart: { id: dataMart.id, title: dataMart.title },
          destination: {
            id: dataDestination.id,
            title: dataDestination.title,
            type: toMcpDestinationType(dataDestination.type as DataDestinationType),
          },
          relevance_score: result.finalScore,
          url: result.url,
        },
      ];
    });

    return jsonToolResult({ ...(project ? { project } : {}), reports });
  }
}
