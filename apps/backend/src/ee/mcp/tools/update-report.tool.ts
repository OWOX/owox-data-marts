import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

// The raw shape (exposed to MCP clients) has both change fields optional; the
// parsed schema additionally requires at least one of them, since an update
// with nothing to change is a caller mistake worth surfacing.
const baseInputSchema = z
  .object({
    report_id: z.string().min(1),
    fields: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe(
        "Replacement column selection, e.g. ['field_name_1', 'field_name_2'], or ['*'] for every field; omit to keep current. At least one of fields/name is required."
      ),
    name: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('New report name; omit to keep current. At least one of fields/name is required.'),
  })
  .strict();

const inputSchema = baseInputSchema.refine(
  input => input.fields !== undefined || input.name !== undefined,
  {
    message: 'Provide at least one of fields or name to update',
  }
);

type UpdateReportInput = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateReportTool implements McpToolDefinition<UpdateReportInput> {
  readonly name = 'update_report';
  readonly description =
    'Update an existing report: rename it and/or replace which data mart fields it exports. Provide at least one of name or fields; anything not provided stays unchanged.';
  readonly zodSchema = baseInputSchema.shape;
  readonly outputSchema = {
    report_id: z.string().describe('Id of the updated report'),
    status: z.literal('updated').describe("Always 'updated' on success"),
  };
  readonly annotations = {
    title: 'Update Report',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade
  ) {}

  parseInput(input: unknown): UpdateReportInput {
    return inputSchema.parse(input);
  }

  async handler(input: UpdateReportInput, context: McpAuthContext): Promise<McpToolResult> {
    const { report_id, fields, name } = this.parseInput(input);

    const result = await this.reports.updateReport({
      reportId: report_id,
      fields,
      name,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });

    return jsonToolResult({ report_id: result.report_id, status: result.status });
  }
}
