import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

// The raw shape (exposed to MCP clients) has every change field optional; the
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
        "Replacement column selection, e.g. ['field_name_1', 'field_name_2'], or ['*'] for every field; omit to keep current. At least one of fields/name/message is required."
      ),
    name: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'New report name; omit to keep current. At least one of fields/name/message is required.'
      ),
    message: z
      .object({
        subject: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('New message subject or heading; omit to keep the current one.'),
        body: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'New message body template; supports the {{table}} placeholder. Replaces the current body — and switches the report to a custom message if it used an insight template. Omit to keep the current one.'
          ),
      })
      .strict()
      .optional()
      .describe(
        'Message changes. Applies only to reports with an email, slack, teams, or google_chat destination; rejected for other types. Provide at least one of subject/body inside. The send condition and recipients are not editable here.'
      ),
  })
  .strict();

const inputSchema = baseInputSchema
  .refine(
    input => input.fields !== undefined || input.name !== undefined || input.message !== undefined,
    {
      message: 'Provide at least one of fields, name, or message to update',
    }
  )
  .refine(
    input =>
      input.message === undefined ||
      input.message.subject !== undefined ||
      input.message.body !== undefined,
    {
      message: 'Provide at least one of message.subject or message.body',
      path: ['message'],
    }
  );

type UpdateReportInput = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateReportTool implements McpToolDefinition<UpdateReportInput> {
  readonly name = 'update_report';
  readonly description =
    'Update an existing report: rename it, replace which data mart fields it exports, and/or — for reports with an email, slack, teams, or google_chat destination — change the message subject or body. Provide at least one of name, fields, or message; anything not provided stays unchanged.';
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
    const { report_id, fields, name, message } = this.parseInput(input);

    const result = await this.reports.updateReport({
      reportId: report_id,
      fields,
      name,
      message,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    });

    return jsonToolResult({ report_id: result.report_id, status: result.status });
  }
}
