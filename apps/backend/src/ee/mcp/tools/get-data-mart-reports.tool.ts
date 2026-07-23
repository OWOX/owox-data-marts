import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import { MCP_DESTINATION_TYPES } from '../../../data-marts/facades/mcp-destination-type';
import { ReportRunStatus } from '../../../data-marts/enums/report-run-status.enum';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildDataDestinationsUiPath, buildReportsUiPath } from './data-mart-ui-path';
import { joinPublicOrigin } from './mcp-public-url.util';

const inputSchema = z.object({ data_mart_id: z.string().min(1) }).strict();

type GetDataMartReportsInput = z.infer<typeof inputSchema>;

@Injectable()
export class GetDataMartReportsTool implements McpToolDefinition<GetDataMartReportsInput> {
  readonly name = 'get_data_mart_reports';
  readonly description =
    'List the reports tied to a data mart in the active OWOX project, including each report destination, run schedules (a report can have any number of schedule triggers), and last run status.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    reports: z.array(
      z.object({
        report_id: z.string(),
        report_url: z.string().describe('Open this Data Mart reports page in OWOX.'),
        data_mart_id: z.string(),
        name: z.string(),
        destination_id: z.string(),
        destination_url: z.string().describe('Open the report destination in OWOX.'),
        destination_type: z.enum(MCP_DESTINATION_TYPES),
        owner: z.string().nullable(),
        schedules: z.array(
          z.object({
            trigger_id: z.string(),
            cron_expression: z.string(),
            time_zone: z.string(),
            is_active: z.boolean(),
            next_run_at: z.string().nullable(),
            last_run_at: z.string().nullable(),
          })
        ),
        last_run_at: z.string().nullable(),
        last_run_status: z.nativeEnum(ReportRunStatus).nullable(),
      })
    ),
  };
  readonly annotations = {
    title: 'Get Data Mart Reports',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): GetDataMartReportsInput {
    return inputSchema.parse(input);
  }

  async handler(input: GetDataMartReportsInput, context: McpAuthContext): Promise<McpToolResult> {
    const { data_mart_id } = this.parseInput(input);

    const result = await this.reports.getDataMartReports({
      dataMartId: data_mart_id,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const reportUrl = joinPublicOrigin(
      publicOrigin,
      buildReportsUiPath(context.projectId, data_mart_id)
    );
    const structuredContent = {
      reports: result.reports.map(report => ({
        ...report,
        report_url: reportUrl,
        destination_url: joinPublicOrigin(
          publicOrigin,
          buildDataDestinationsUiPath(context.projectId, report.destination_id)
        ),
      })),
    };

    return jsonToolResult(structuredContent);
  }
}
