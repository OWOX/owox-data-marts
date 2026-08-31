import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z.object({ report_id: z.string().trim().min(1) }).strict();

type GetReportOutputSchemaInput = z.infer<typeof inputSchema>;

@Injectable()
export class GetReportOutputSchemaTool implements McpToolDefinition<GetReportOutputSchemaInput> {
  readonly name = 'get_report_output_schema';
  readonly description =
    "The columns a report's rows will carry, in the order they are projected — the names to put " +
    'above the values the report delivers. Includes the columns a report synthesises (aggregated ' +
    '`revenue | SUM`, Unique Count, calculated fields), which appear in no data mart schema. ' +
    'Answers from the stored schema and the report config, so it reads no report data — the ' +
    "columns are as of the Data Mart's last schema actualization, so one added warehouse-side and " +
    'not yet actualized is missing until a run or a data read picks it up. One ' +
    'caveat behind the read-only hint: for a report that joins other data marts, resolving the ' +
    "join refreshes each SQL-defined source's technical view, so a repeated call is not free on " +
    'the warehouse.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    columns: z.array(
      z.object({
        name: z.string().describe('The key each output row is keyed by.'),
        title: z.string().nullable().describe('Alias configured for the column, if any.'),
        description: z.string().nullable(),
        type: z.string().nullable().describe('Storage field type, when it can be derived.'),
        aggregate_function: z
          .string()
          .nullable()
          .describe('The aggregate function the report applies to this column, if any.'),
        // A bare string, not z.enum: this is an OUTPUT schema over a level the facade forwards
        // from persisted JSON, and the SDK validates structuredContent against it — so a hardcoded
        // vocabulary would turn "a level was added to the domain" into an McpError from this tool.
        // Same call `data-mart-details.tool.ts` makes for its own `level`, for the same reason.
        calculated_field_level: z
          .string()
          .nullable()
          .describe(
            'Calculated fields only. `metric` AGGREGATES — never re-aggregate it, whatever `type` says. `column` is row-level with no warehouse column behind it. null is an ordinary native column, which may be rolled up.'
          ),
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
      columns: result.columns.map(column => ({
        name: column.name,
        title: column.title,
        description: column.description,
        type: column.type,
        aggregate_function: column.aggregateFunction,
        calculated_field_level: column.calculatedFieldLevel,
      })),
    });
  }
}
