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

type DeleteReportInput = z.infer<typeof inputSchema>;

@Injectable()
export class DeleteReportTool implements McpToolDefinition<DeleteReportInput> {
  readonly name = 'delete_report';
  readonly description =
    'Permanently delete a report by id. The report stops running and disappears from the project; the underlying data mart, destination, and any already-exported documents are not affected. This cannot be undone.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    status: z.literal('deleted'),
  };
  readonly annotations = {
    title: 'Delete Report',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade
  ) {}

  parseInput(input: unknown): DeleteReportInput {
    return inputSchema.parse(input);
  }

  async handler(input: DeleteReportInput, context: McpAuthContext): Promise<McpToolResult> {
    const { report_id } = this.parseInput(input);

    const result = await this.reports.deleteReport({
      reportId: report_id,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });

    return jsonToolResult({ report_id: result.report_id, status: result.status });
  }
}
