import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import { MCP_DESTINATION_TYPES } from '../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildReportsUiPath } from './data-mart-ui-path';
import { LOOKER_STUDIO_DESTINATION_GUIDE_URL } from './mcp-docs-urls';
import { joinPublicOrigin } from './mcp-public-url.util';

/**
 * Looker Studio reports are pull-based: creating one only makes the data mart
 * available to the destination — data shows up in a dashboard after the user
 * connects Looker Studio to OWOX with the destination's credentials. The agent
 * cannot do that step (the JSON Config holds a secret key that is never sent
 * through MCP/chat), so the result explains it and links the guide.
 */
const LOOKER_STUDIO_REPORT_INSTRUCTIONS =
  'The report is created: this data mart is now available to Looker Studio through the ' +
  'selected destination. Data appears in a dashboard only after the destination is ' +
  'connected in Looker Studio. If that is already done, the new report is ready to use ' +
  'as a data source. Otherwise the user must do it themselves (the JSON Config contains ' +
  'a secret key that is never sent through MCP/chat): open the destination in the OWOX ' +
  'Data Marts UI, copy its JSON Config, and paste it into the OWOX Data Marts connector ' +
  'in Looker Studio. Share the setup_guide_url with the user — it walks through every step.';

const inputSchema = z
  .object({
    data_mart_id: z.string().min(1),
    destination_id: z.string().min(1),
    fields: z
      .array(z.string().min(1))
      .min(1)
      .describe("Column names to include, or ['*'] for every field"),
    name: z.string().trim().min(1),
    message: z
      .object({
        subject: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Message subject or heading. Defaults to the report name.'),
        body: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Message body template. Supports the {{table}} placeholder, which renders the report's result table."
          ),
      })
      .strict()
      .optional()
      .describe(
        'Message settings. Required for email, slack, teams, and google_chat destinations; rejected for other types. Recipients and channels are configured on the destination itself, and the message is sent on every report run.'
      ),
  })
  .strict();

type AddReportInput = z.infer<typeof inputSchema>;

@Injectable()
export class AddReportTool implements McpToolDefinition<AddReportInput> {
  readonly name = 'add_report';
  readonly description =
    'Create a report that exports a data mart to an existing destination (create one with add_destination if the project has none — check list_destinations first). Google Sheets: a new Google Sheet is created automatically (an external Google Drive side effect) and the report is linked to it; returns the report and sheet links. Looker Studio: the report is created with default settings and accepts no extra parameters; the result includes instructions and a setup_guide_url to relay to the user, because dashboard data only flows after they connect Looker Studio to OWOX themselves. Email, Slack, Microsoft Teams, Google Chat: requires the message parameter; each report run sends the rendered message to the recipients or channels configured on the destination.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    destination_type: z
      .enum(MCP_DESTINATION_TYPES)
      .describe('Type of the destination the report was created for.'),
    report_url: z.string(),
    sheet_url: z
      .string()
      .optional()
      .describe('Link to the auto-created Google Sheet. Google Sheets destinations only.'),
    owner: z.string().nullable(),
    status: z.literal('created'),
    instructions: z
      .string()
      .optional()
      .describe(
        'Looker Studio only. What has to happen before dashboard data flows; relay this to the user.'
      ),
    setup_guide_url: z
      .string()
      .optional()
      .describe(
        'Looker Studio only. Public step-by-step guide for connecting Looker Studio to OWOX — share this link with the user.'
      ),
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
    const { data_mart_id, destination_id, fields, name, message } = this.parseInput(input);

    const result = await this.reports.addReport({
      dataMartId: data_mart_id,
      destinationId: destination_id,
      fields,
      name,
      message,
      projectId: context.projectId,
      userId: context.userId,
      userEmail: context.email,
      roles: context.roles,
    });

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const isLookerStudio = result.destination_type === 'looker_studio';
    // The sheet fields exist only for Google Sheets destinations and the
    // connection guidance only for Looker Studio; spread them conditionally so
    // other results carry no dangling keys.
    const structuredContent = {
      report_id: result.report_id,
      destination_type: result.destination_type,
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
      ...(isLookerStudio && {
        instructions: LOOKER_STUDIO_REPORT_INSTRUCTIONS,
        setup_guide_url: LOOKER_STUDIO_DESTINATION_GUIDE_URL,
      }),
    };

    return jsonToolResult(structuredContent);
  }
}
