import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z
  .object({
    report_id: z.string().trim().min(1),
  })
  .strict();

type RunReportInput = z.infer<typeof inputSchema>;

@Injectable()
export class RunReportTool implements McpToolDefinition<RunReportInput> {
  readonly name = 'run_report';
  readonly description =
    'Start a report run by report_id, delivering fresh data to its push destination (Google Sheets, Email, Slack, Microsoft Teams, or Google Chat). Use this when the user wants up-to-date data in an existing report. Returns immediately with just report_id and run_id — it does not wait for the run to finish and does not report status. After starting one, poll get_report_run_status with the returned ids until should_poll is false; follow that tool message, waiting up to 15 seconds between checks when possible. Each run_report call starts a new, separately billed run, so never call run_report again for the same report while a run is in progress — keep polling the existing run_id instead. If the report already has a run in flight, this call fails with "Report is already running or pending"; that is not a report failure. Pull-based consumers (Data Studio, HTTP Data API) fetch data themselves and cannot be run with this tool. Billed as a standard Report Run for the destination, not as an MCP query.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    run_id: z.string(),
  };
  readonly annotations = {
    title: 'Run Report',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade
  ) {}

  parseInput(input: unknown): RunReportInput {
    return inputSchema.parse(input);
  }

  async handler(input: RunReportInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);

    const result = await this.reports.runReport({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      reportId: parsed.report_id,
    });

    return jsonToolResult({
      report_id: result.reportId,
      run_id: result.runId,
    });
  }
}
