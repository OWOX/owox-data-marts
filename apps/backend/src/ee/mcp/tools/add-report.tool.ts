import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_REPORTS_FACADE,
  type McpAddReportInitialRunResult,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import { MCP_DESTINATION_TYPES } from '../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildReportsUiPath } from './data-mart-ui-path';
import { LOOKER_STUDIO_DESTINATION_GUIDE_URL } from './mcp-docs-urls';
import { joinPublicOrigin } from './mcp-public-url.util';
import {
  makeMcpAggregationSchema,
  makeMcpDateBucketSchema,
  makeMcpFilterSchema,
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

const initialRunOutputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('queued'),
    run_id: z.string(),
    should_poll: z.literal(true),
    message: z.string(),
  }),
  z.object({
    status: z.literal('not_requested'),
    should_poll: z.literal(false),
    message: z.string(),
  }),
  z.object({
    status: z.literal('not_applicable'),
    should_poll: z.literal(false),
    message: z.string(),
  }),
  z.object({
    status: z.literal('failed_to_queue'),
    should_poll: z.literal(false),
    error: z.string(),
    message: z.string(),
  }),
]);

const inputSchema = z
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
      .array(makeMcpAggregationSchema())
      .min(1)
      .optional()
      .describe(
        'Aggregations applied on every report run, same as query_data_mart\'s "aggregations". Each aggregated field must also appear in fields; fields that are neither aggregated nor bucketed become group-by dimensions. Omit to export raw rows.'
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
  })
  .strict();

type AddReportInput = z.infer<typeof inputSchema>;

@Injectable()
export class AddReportTool implements McpToolDefinition<AddReportInput> {
  readonly name = 'add_report';
  readonly description =
    'Create a report that exports a data mart to an existing destination (create one with add_destination if the project has none — check list_destinations first). For push destinations, the new report runs immediately by default: this starts one billed Report Run and delivers data, then initial_run returns the run_id to poll with get_report_run_status. Set run_immediately=false only when the user explicitly wants to create configuration without delivering data, such as before adding a schedule. Every destination type accepts the same optional output controls as query_data_mart — filters, slices, aggregations, date_buckets, sort — applied on each run: when the user asks to export numbers they saw in a query, copy those parameters verbatim from that query so the report matches what they saw. Google Sheets: a new Google Sheet is created automatically (an external Google Drive side effect) and linked to the report. Looker Studio is pull-based, never runs through this tool, and accepts no name; omit run_immediately or set it false. Email, Slack, Microsoft Teams, Google Chat: requires message; the default initial run sends it to the configured recipients or channels.';
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
    initial_run: initialRunOutputSchema.describe(
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
      projectId: context.projectId,
      userId: context.userId,
      userEmail: context.email,
      roles: context.roles,
    };

    let result;
    try {
      result = await this.reports.addReport(request);
    } catch (err) {
      rethrowTranslatedOutputControlsError(err);
    }

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
      initial_run: this.toInitialRunOutput(result.initial_run),
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

  private toInitialRunOutput(initialRun: McpAddReportInitialRunResult) {
    switch (initialRun.status) {
      case 'queued':
        return {
          status: 'queued' as const,
          run_id: initialRun.run_id,
          should_poll: true as const,
          message:
            'The report was created and its initial run was queued. Poll get_report_run_status with this report_id and run_id until should_poll is false. Do not call run_report again for this initial run.',
        };
      case 'not_requested':
        return {
          status: 'not_requested' as const,
          should_poll: false as const,
          message:
            'The report was created without an initial run because run_immediately was false. No data was delivered; call run_report later or create a schedule.',
        };
      case 'not_applicable':
        return {
          status: 'not_applicable' as const,
          should_poll: false as const,
          message:
            'This report uses a pull-based destination, so an initial run is not applicable.',
        };
      case 'failed_to_queue':
        return {
          status: 'failed_to_queue' as const,
          should_poll: false as const,
          error: initialRun.error,
          message:
            'The report was created, but its initial run could not be queued. Do not call add_report again. Retry delivery with run_report using this report_id.',
        };
    }
  }
}
