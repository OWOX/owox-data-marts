import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_REPORTS_FACADE,
  McpSimilarReportExistsException,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import {
  MCP_DESTINATION_TYPES,
  type McpDestinationType,
} from '../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { reportSheetInfoOutputShape } from './report-output-controls-output';
import { reportRunOutcomeSchema, toReportRunOutcomeOutput } from './report-run-outcome';
import { buildReportsUiPath } from './data-mart-ui-path';
import { LOOKER_STUDIO_DESTINATION_GUIDE_URL } from './mcp-docs-urls';
import { joinPublicOrigin } from './mcp-public-url.util';
import {
  makeMcpDateBucketSchema,
  makeMcpFilterSchema,
  makeMcpReportAggregationSchema,
  makeMcpSortSchema,
} from './query-data-mart.input';
import {
  mapReportAggregations,
  mapReportDateBuckets,
  mapReportFilters,
  mapReportSort,
} from './report-output-controls-input';
import { rethrowTranslatedOutputControlsError } from './output-controls-error.mapper';

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

const INITIAL_RUN_MESSAGES = {
  queued:
    'The report was created and its initial run was queued. Poll get_report_run_status with this report_id and run_id until should_poll is false. Do not call run_report again for this initial run.',
  not_requested:
    'The report was created without an initial run because run_immediately was false. No data was delivered; call run_report later or create a schedule.',
  not_applicable: 'This report uses a pull-based destination, so an initial run is not applicable.',
  failed_to_queue:
    'The report was created, but its initial run could not be queued. Do not call add_report again. Retry delivery with run_report using this report_id.',
};

/**
 * The similar-report refusal is a structured error rather than a plain message:
 * the agent needs the existing report's id and current controls to turn the
 * request into an update_report call, and the error code to explain the
 * alternative (allow_similar) only when the user really wants a second report.
 */
export const SIMILAR_REPORT_EXISTS_ERROR_CODE = 'similar_report_exists';

/**
 * What an update_report call will and will not deliver for the existing report's
 * destination — the agent must not tell the user a message was re-sent when the
 * default for email-family reports is to update silently.
 */
function refreshGuidanceFor(destinationType: McpDestinationType): string {
  switch (destinationType) {
    case 'google_sheets':
      return 'update_report re-runs a Google Sheets report by default when the export changes, so the sheet refreshes on its own.';
    case 'email':
    case 'slack':
    case 'teams':
    case 'google_chat':
      return 'update_report does NOT re-send an email or chat report: the message is delivered again only with run_immediately=true, so pass it only if the user explicitly wants it sent now.';
    default:
      return 'update_report does not run this destination type; it only changes the report definition.';
  }
}

// Exported for the JSON-Schema advertising contract spec (mcp-operator-advertising.spec.ts).
export const addReportInputSchema = z
  .object({
    data_mart_id: z.string().min(1),
    destination_id: z.string().min(1),
    fields: z
      .array(z.string().min(1))
      .min(1)
      .describe("Column names to include, or ['*'] for every field"),
    filters: z
      .array(makeMcpFilterSchema())
      .min(1)
      .optional()
      .describe(
        'Row filters applied on every report run, so the export matches a filtered query_data_mart result — same shape and operator vocabulary as query_data_mart\'s "filters"; copy them verbatim from the query whose numbers the user is looking at. A filter may reference a field that is not in fields. Omit to export all rows.'
      ),
    slices: z
      .array(makeMcpFilterSchema())
      .min(1)
      .optional()
      .describe(
        'Pre-join filters, same as query_data_mart\'s "slices": narrow a JOINED data mart before it is blended in. Only applicable to blended data marts; criteria on the main data mart belong in "filters".'
      ),
    aggregations: z
      .array(makeMcpReportAggregationSchema())
      .min(1)
      .optional()
      .describe(
        'Aggregations applied on every report run, same as query_data_mart\'s "aggregations" plus the report-only STRING_AGG and ANY_VALUE. Each aggregated field must also appear in fields; fields that are neither aggregated nor bucketed become group-by dimensions. Omit to export raw rows.'
      ),
    date_buckets: z
      .array(makeMcpDateBucketSchema())
      .min(1)
      .optional()
      .describe(
        'Bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR, same as query_data_mart\'s "date_buckets". Each bucketed field must also appear in fields.'
      ),
    sort: z
      .array(makeMcpSortSchema())
      .min(1)
      .optional()
      .describe(
        'Order the exported rows, same as query_data_mart\'s "sort". Each sorted field must also appear in fields.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Max rows each report run exports. Omit for no cap. Do NOT copy the interactive limit from a query_data_mart call unless the user explicitly wants the export capped.'
      ),
    name: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Report name — also the new sheet's title (Google Sheets) and the default message subject (email family). Required for those destination types; not accepted for Looker Studio, whose reports carry no name."
      ),
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
    run_immediately: z
      .boolean()
      .optional()
      .describe(
        'Whether to run the new report immediately. Defaults to true for push destinations (Google Sheets, Email, Slack, Microsoft Teams, Google Chat), which starts one billed Report Run and delivers data. Set false only when the user explicitly wants configuration-only creation, such as before adding a schedule. Looker Studio is pull-based: omit this field or set false; true is rejected.'
      ),
    spreadsheet_id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Google Sheets only. Add the report as a new sheet (tab) of this existing spreadsheet instead of creating a new file — use the spreadsheet_id returned by an earlier add_report in this conversation, or by get_data_mart_reports. Pass it whenever the user asks for several related exports, so they land in ONE document. The sheet is named after `name` and must not exist yet; the destination's connected Google account needs edit access to the spreadsheet. Rejected for other destination types."
      ),
    allow_similar: z
      .boolean()
      .optional()
      .describe(
        'By default add_report refuses (error_code similar_report_exists) when you already created a report exporting the same fields from this data mart to this destination — change that report with update_report instead. Set true only after the user explicitly confirmed they want a separate, additional report.'
      ),
  })
  .strict();

type AddReportInput = z.infer<typeof addReportInputSchema>;

@Injectable()
export class AddReportTool implements McpToolDefinition<AddReportInput> {
  readonly name = 'add_report';
  readonly description =
    'Create a report that exports a data mart to an existing destination (create one with add_destination if the project has none — check list_destinations first). This is THE way to export, save, or deliver OWOX data — to Google Sheets, email, Slack, Microsoft Teams, Google Chat, or Looker Studio; never copy query_data_mart rows into a CSV, a file, or a document through another integration. Create one report per user request, then change it with update_report when the user asks to add a filter, sort, aggregation, or rename it — do not create another report for the same data: the tool refuses a report whose fields duplicate one you already created on this data mart and destination (error_code similar_report_exists). For push destinations, the new report runs immediately by default: this starts one billed Report Run and delivers data, then initial_run returns the run_id to poll with get_report_run_status. Set run_immediately=false only when the user explicitly wants to create configuration without delivering data, such as before adding a schedule. Every destination type accepts the same optional output controls as query_data_mart — filters, slices, aggregations, date_buckets, sort — applied on each run: when the user asks to export numbers they saw in a query, copy those parameters verbatim from that query so the report matches what they saw. Google Sheets: a new Google Sheet is created automatically (an external Google Drive side effect) and linked to the report; pass spreadsheet_id to add the report as a sheet of an existing spreadsheet instead, so several related exports share one document. Looker Studio is pull-based, never runs through this tool, and accepts no name; omit run_immediately or set it false. Email, Slack, Microsoft Teams, Google Chat: requires message; the default initial run sends it to the configured recipients or channels.';
  readonly zodSchema = addReportInputSchema.shape;
  readonly outputSchema = {
    report_id: z.string(),
    destination_type: z
      .enum(MCP_DESTINATION_TYPES)
      .describe('Type of the destination the report was created for.'),
    report_url: z.string(),
    ...reportSheetInfoOutputShape,
    owner: z.string().nullable(),
    status: z.literal('created'),
    initial_run: reportRunOutcomeSchema.describe(
      'Outcome of the automatic first run. The report exists for every status, including failed_to_queue.'
    ),
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
        'Google Sheets only, new files only. True when the configured Drive folder could not be used and the sheet was created in the Drive root instead.'
      ),
    shared_with_requester: z
      .boolean()
      .optional()
      .describe(
        'Google Sheets only, new files only. False when the sheet could not be shared with you; opening the link may require requesting access.'
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
    return addReportInputSchema.parse(input);
  }

  async handler(input: AddReportInput, context: McpAuthContext): Promise<McpToolResult> {
    const {
      data_mart_id,
      destination_id,
      fields,
      filters,
      slices,
      aggregations,
      date_buckets,
      sort,
      limit,
      name,
      message,
      run_immediately,
      spreadsheet_id,
      allow_similar,
    } = this.parseInput(input);

    const request = {
      dataMartId: data_mart_id,
      destinationId: destination_id,
      fields,
      filterConfig: mapReportFilters(slices, filters),
      aggregationConfig: mapReportAggregations(aggregations),
      dateTruncConfig: mapReportDateBuckets(date_buckets),
      sortConfig: mapReportSort(sort),
      limitConfig: limit,
      name,
      message,
      runImmediately: run_immediately,
      spreadsheetId: spreadsheet_id,
      allowSimilar: allow_similar,
      projectId: context.projectId,
      userId: context.userId,
      userEmail: context.email,
      roles: context.roles,
    };

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const reportUrl = joinPublicOrigin(
      publicOrigin,
      buildReportsUiPath(context.projectId, data_mart_id)
    );

    let result;
    try {
      result = await this.reports.addReport(request);
    } catch (err) {
      if (err instanceof McpSimilarReportExistsException) {
        return this.toSimilarReportError(err, reportUrl);
      }
      rethrowTranslatedOutputControlsError(err);
    }

    const isLookerStudio = result.destination_type === 'looker_studio';
    // The sheet fields exist only for Google Sheets destinations and the
    // connection guidance only for Looker Studio; spread them conditionally so
    // other results carry no dangling keys.
    const structuredContent = {
      report_id: result.report_id,
      destination_type: result.destination_type,
      report_url: reportUrl,
      ...(result.spreadsheet_id !== undefined && { spreadsheet_id: result.spreadsheet_id }),
      ...(result.sheet_url !== undefined && { sheet_url: result.sheet_url }),
      owner: result.owner,
      status: result.status,
      initial_run: toReportRunOutcomeOutput(result.initial_run, INITIAL_RUN_MESSAGES),
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

  /**
   * Nothing was created. The payload carries the existing report exactly as
   * get_data_mart_reports would list it, so the agent can go straight to
   * update_report with the controls it needs to keep.
   *
   * It travels ONLY as text: the MCP SDK client validates `structuredContent`
   * against the tool's outputSchema even on an error result, and this payload
   * is deliberately not a created report — with structuredContent set, an
   * SDK-based client would throw InvalidParams and the agent would never see
   * existing_report.
   */
  private toSimilarReportError(
    err: McpSimilarReportExistsException,
    reportUrl: string
  ): McpToolResult {
    const payload = {
      error_code: SIMILAR_REPORT_EXISTS_ERROR_CODE,
      message:
        `${err.message} The existing report's current fields and output controls are in existing_report: ` +
        'to change what it exports, call update_report with its report_id, sending only the controls that change. ' +
        `${refreshGuidanceFor(err.existingReport.destination_type)} Tell the user which report you reused.`,
      existing_report: { ...err.existingReport, report_url: reportUrl },
    };
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }
}
