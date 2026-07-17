import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildReportsUiPath } from './data-mart-ui-path';
import { joinPublicOrigin } from './mcp-public-url.util';

const inputSchema = z
  .object({
    data_mart_id: z.string().min(1),
    destination_id: z.string().min(1),
    fields: z
      .array(z.string().min(1))
      .min(1)
      .describe("Column names to include, or ['*'] for every field"),
    name: z.string().trim().min(1),
  })
  .strict();

type AddReportInput = z.infer<typeof inputSchema>;

@Injectable()
export class AddReportTool implements McpToolDefinition<AddReportInput> {
  readonly name = 'add_report';
  readonly description =
    'Create a report that exports a data mart to a Google Sheets or Looker Studio destination. Google Sheets: a new Google Sheet is created automatically (an external Google Drive side effect) and the report is linked to it; returns the report and sheet links. Looker Studio: the report is created with default settings and accepts no extra parameters; returns the report link. Other destination types are not supported yet.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    report_url: z.string(),
    sheet_url: z
      .string()
      .optional()
      .describe('Link to the auto-created Google Sheet. Google Sheets destinations only.'),
    owner: z.string().nullable(),
    status: z.literal('created'),
    placed_in_root: z
      .boolean()
      .optional()
      .describe(
        'Google Sheets only. True when the configured Drive folder could not be used and the sheet was created in the Drive root instead.'
      ),
    shared_with_requester: z
      .boolean()
      .optional()
      .describe(
        'Google Sheets only. False when the sheet could not be shared with you; opening the link may require requesting access.'
      ),
  };
  readonly annotations = {
    title: 'Add Report',
    readOnlyHint: false,
    destructiveHint: false,
    // Unlike the other tools, this one can reach outside the OWOX domain: for
    // Google Sheets destinations it creates a document in Google Drive and may
    // share it with the requester. The hint is static per tool, so it stays
    // true even though the Looker Studio path has no external side effect.
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): AddReportInput {
    return inputSchema.parse(input);
  }

  async handler(input: AddReportInput, context: McpAuthContext): Promise<McpToolResult> {
    const { data_mart_id, destination_id, fields, name } = this.parseInput(input);

    const result = await this.reports.addReport({
      dataMartId: data_mart_id,
      destinationId: destination_id,
      fields,
      name,
      projectId: context.projectId,
      userId: context.userId,
      userEmail: context.email,
      roles: context.roles,
    });

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    // The sheet fields exist only for Google Sheets destinations; spread them
    // conditionally so non-Sheets results carry no dangling keys.
    const structuredContent = {
      report_id: result.report_id,
      report_url: joinPublicOrigin(
        publicOrigin,
        buildReportsUiPath(context.projectId, data_mart_id)
      ),
      ...(result.sheet_url !== undefined && { sheet_url: result.sheet_url }),
      owner: result.owner,
      status: result.status,
      ...(result.placed_in_root !== undefined && { placed_in_root: result.placed_in_root }),
      ...(result.shared_with_requester !== undefined && {
        shared_with_requester: result.shared_with_requester,
      }),
    };

    return jsonToolResult(structuredContent);
  }
}
