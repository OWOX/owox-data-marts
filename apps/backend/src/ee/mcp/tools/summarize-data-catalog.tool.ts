import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';
import { buildDataMartUiPath } from './data-mart-ui-path';
import { joinPublicOrigin } from './mcp-public-url.util';

const inputSchema = z.object({}).strict();
type SummarizeDataCatalogInput = z.infer<typeof inputSchema>;

const INSTRUCTION =
  'You have received a high-level summary of the published Data Mart catalog available to this MCP connection. Summarize the business areas covered by the listed Data Marts and suggest 4-6 concrete example prompts the user could ask. Do not claim access to data rows, sample values, row counts, or freshness details.';

@Injectable()
export class SummarizeDataCatalogTool implements McpToolDefinition<SummarizeDataCatalogInput> {
  readonly name = 'summarize_data_catalog';
  readonly description =
    'Returns a high-level summary input for the current OWOX project published Data Mart catalog so the LLM can orient the user. Use when the user asks open-ended questions like "what data is available here?", "what can I analyze?", or "where should I start?". The tool returns counts and top published Data Marts ranked by configured relationship connectivity, with shortened descriptions and basic usage metadata. It does not query actual data rows, compute data freshness, or generate a natural-language summary.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    project_id: z.string(),
    data_mart_count: z.number(),
    top_data_marts_by_connectivity: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        url: z.string(),
        relationship_count: z.number(),
        reports_count: z.number(),
        triggers_count: z.number(),
        updated_at: z.string(),
      })
    ),
    _instruction: z.string(),
  };
  readonly annotations = {
    title: 'Summarize Data Catalog',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_DATA_MARTS_FACADE)
    private readonly dataMarts: McpDataMartsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): SummarizeDataCatalogInput {
    return inputSchema.parse(input);
  }

  async handler(input: SummarizeDataCatalogInput, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);

    const result = await this.dataMarts.summarizeDataCatalog({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });
    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const structuredContent = {
      project_id: result.projectId,
      data_mart_count: result.dataMartCount,
      top_data_marts_by_connectivity: result.topDataMartsByConnectivity.map(dataMart => ({
        id: dataMart.id,
        title: dataMart.title,
        description: dataMart.description,
        url: joinPublicOrigin(publicOrigin, buildDataMartUiPath(context.projectId, dataMart.id)),
        relationship_count: dataMart.relationshipCount,
        reports_count: dataMart.reportsCount,
        triggers_count: dataMart.triggersCount,
        updated_at: dataMart.updatedAt,
      })),
      _instruction: INSTRUCTION,
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
