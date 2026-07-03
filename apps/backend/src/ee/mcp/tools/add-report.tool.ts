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
import { buildReportsUiPath, joinPublicOrigin } from './data-mart-ui-path';

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
    'Create a report that exports a data mart to a Google Sheets destination. A new Google Sheet is created automatically and the report is linked to it. Returns the report and sheet links.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    report_url: z.string(),
    sheet_url: z.string(),
    owner: z.string().nullable(),
    status: z.literal('created'),
    placed_in_root: z
      .boolean()
      .optional()
      .describe(
        'True when the configured Drive folder could not be used and the sheet was created in the Drive root instead.'
      ),
    shared_with_requester: z
      .boolean()
      .optional()
      .describe(
        'False when the sheet could not be shared with you; opening the link may require requesting access.'
      ),
  };
  readonly annotations = {
    title: 'Add Report',
    readOnlyHint: false,
    destructiveHint: false,
    // Unlike the other tools, this one reaches outside the OWOX domain: it
    // creates a document in Google Drive and may share it with the requester.
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
    const structuredContent = {
      report_id: result.report_id,
      report_url: joinPublicOrigin(
        publicOrigin,
        buildReportsUiPath(context.projectId, data_mart_id)
      ),
      sheet_url: result.sheet_url,
      owner: result.owner,
      status: result.status,
      placed_in_root: result.placed_in_root,
      shared_with_requester: result.shared_with_requester,
    };

    return jsonToolResult(structuredContent);
  }
}
