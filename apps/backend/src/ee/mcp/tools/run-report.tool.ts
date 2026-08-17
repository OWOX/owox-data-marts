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
    'Start an existing report by report_id and deliver fresh data to its push destination. Use this for a later rerun or when add_report returned initial_run.status="failed_to_queue". Do not call it when add_report already returned a queued run_id. Returns immediately with report_id and run_id; it does not wait for final status. Poll get_report_run_status with those ids until should_poll is false, waiting up to 15 seconds between checks when possible. Each call starts a new billed Report Run; concurrent runs are rejected as "Report is already running or pending".';
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
