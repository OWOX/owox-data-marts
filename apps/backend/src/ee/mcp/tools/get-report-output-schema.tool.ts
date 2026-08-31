import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z.object({ report_id: z.string().min(1) }).strict();

type GetReportOutputSchemaInput = z.infer<typeof inputSchema>;

@Injectable()
export class GetReportOutputSchemaTool implements McpToolDefinition<GetReportOutputSchemaInput> {
  readonly name = 'get_report_output_schema';
  readonly description =
    "The columns a report's rows will carry, in the order they are projected — the names to put " +
    'above the values the report delivers. Includes the columns a report synthesises (aggregated ' +
    '`revenue | SUM`, Unique Count, calculated fields), which appear in no data mart schema. ' +
    'Answers from the stored schema and the report config, so it reads no report data.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    columns: z.array(
      z.object({
        name: z.string().describe('The key each output row is keyed by.'),
        title: z.string().nullable().describe('Alias configured for the column, if any.'),
        description: z.string().nullable(),
        type: z.string().nullable().describe('Storage field type, when it can be derived.'),
      })
    ),
  };
  readonly annotations = {
    title: 'Get Report Output Schema',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade
  ) {}

  parseInput(input: unknown): GetReportOutputSchemaInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: GetReportOutputSchemaInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const parsed = this.parseInput(input);

    const result = await this.reports.getReportOutputSchema({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      reportId: parsed.report_id,
    });

    return jsonToolResult({
      report_id: result.reportId,
      columns: result.columns,
    });
  }
}
