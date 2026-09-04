import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import {
  MCP_DESTINATION_TYPES,
  type McpDestinationType,
} from '../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import {
  reportOutputControlsOutputShape,
  reportSheetInfoOutputShape,
} from './report-output-controls-output';
import {
  reportRunOutcomeSchema,
  toReportRunOutcomeOutput,
  type ReportRunOutcomeMessages,
} from './report-run-outcome';
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

const EMAIL_FAMILY_DESTINATION_TYPES: ReadonlySet<McpDestinationType> = new Set<McpDestinationType>(
  ['email', 'slack', 'teams', 'google_chat']
);

function isEmailFamily(type: McpDestinationType): boolean {
  return EMAIL_FAMILY_DESTINATION_TYPES.has(type);
}

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
        "Replacement column selection, e.g. ['field_name_1', 'field_name_2'], or ['*'] for every field; omit to keep current. At least one change parameter is required."
      ),
    filters: z
      .array(makeMcpFilterSchema())
      .optional()
      .describe(
        'Replacement row filters applied on every report run — same shape and operator vocabulary as query_data_mart\'s "filters". Replaces only the current row filters (stored slices are untouched) — including any post-aggregation (HAVING) constraints created in the OWOX UI, which cannot be expressed over MCP; pass [] to remove every row filter; omit to keep current.'
      ),
    slices: z
      .array(makeMcpFilterSchema())
      .optional()
      .describe(
        'Replacement pre-join filters (blended data marts only), same as query_data_mart\'s "slices". Replaces only the current slices (stored row filters are untouched); pass [] to remove every slice; omit to keep current.'
      ),
    aggregations: z
      .array(makeMcpReportAggregationSchema())
      .optional()
      .describe(
        'Replacement aggregations, same as query_data_mart\'s "aggregations" plus the report-only STRING_AGG and ANY_VALUE. Each aggregated field must also appear in the report\'s column selection. Replaces ALL current aggregations — copy the ones to keep from get_data_mart_reports; pass [] to remove them; omit to keep current.'
      ),
    date_buckets: z
      .array(makeMcpDateBucketSchema())
      .optional()
      .describe(
        'Replacement date buckets (DAY/WEEK/MONTH/QUARTER/YEAR), same as query_data_mart\'s "date_buckets". Replaces ALL current buckets; pass [] to remove them; omit to keep current.'
      ),
    sort: z
      .array(makeMcpSortSchema())
      .optional()
      .describe(
        'Replacement sort order, same as query_data_mart\'s "sort". Replaces the current order; pass [] to remove it; omit to keep current.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .nullable()
      .optional()
      .describe('New max rows per report run; pass null to remove the cap; omit to keep current.'),
    name: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'New report name; omit to keep current. At least one change parameter is required.'
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
    run_immediately: z
      .boolean()
      .optional()
      .describe(
        'Whether to run the report after the update (one billed Report Run). Omit for the default: a Google Sheets report re-runs when what it exports actually changed (fields or any output control differ from the stored definition), so the sheet reflects the change; it does not run for a name-only or message-only change or for re-sent identical controls. Email, Slack, Microsoft Teams, and Google Chat reports are NOT re-sent by default, because a run delivers the message to every configured recipient or channel — set true only when the user explicitly wants it sent now. Set false to update a Google Sheets report without refreshing it. Looker Studio is pull-based: omit or set false; true is rejected.'
      ),
  })
  .strict();

// Exported for the JSON-Schema advertising contract spec (mcp-operator-advertising.spec.ts).
export const updateReportInputSchema = baseInputSchema
  .refine(
    input =>
      input.fields !== undefined ||
      input.filters !== undefined ||
      input.slices !== undefined ||
      input.aggregations !== undefined ||
      input.date_buckets !== undefined ||
      input.sort !== undefined ||
      input.limit !== undefined ||
      input.name !== undefined ||
      input.message !== undefined,
    {
      message:
        'Provide at least one of fields, filters, slices, aggregations, date_buckets, sort, limit, name, or message to update (run_immediately alone is not a change)',
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

type UpdateReportInput = z.infer<typeof updateReportInputSchema>;

@Injectable()
export class UpdateReportTool implements McpToolDefinition<UpdateReportInput> {
  readonly name = 'update_report';
  readonly description =
    'Update an existing report: rename it, replace which data mart fields it exports, replace its output controls — filters/slices, aggregations, date_buckets, sort, limit — using the same vocabulary as query_data_mart ([] removes a control, null removes the limit), and/or — for reports with an email, slack, teams, or google_chat destination — change the message subject or body. Use it whenever the user asks to change a report that already exists — including one you created earlier in this conversation ("add a filter", "sort by revenue", "rename it") — instead of creating another report with add_report. Provide at least one change; anything not provided stays unchanged. Returns the report as it is after the update, and by default re-runs a Google Sheets report when the export changed (run.status="queued" — poll get_report_run_status), so the sheet shows the new definition; email, Slack, Teams, and Google Chat reports are re-sent only with run_immediately=true.';
  readonly zodSchema = baseInputSchema.shape;
  readonly outputSchema = {
    report_id: z.string().describe('Id of the updated report'),
    status: z.literal('updated').describe("Always 'updated' on success"),
    destination_type: z.enum(MCP_DESTINATION_TYPES),
    name: z.string().describe('Report name after the update'),
    ...reportOutputControlsOutputShape,
    ...reportSheetInfoOutputShape,
    run: reportRunOutcomeSchema.describe(
      'Outcome of the refresh run queued after the update. The update is saved for every status.'
    ),
  };
  readonly annotations = {
    title: 'Update Report',
    readOnlyHint: false,
    destructiveHint: false,
    // The refresh run writes to the customer's Google Sheet or delivers an
    // email / chat message — the same external side effect run_report has.
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade
  ) {}

  parseInput(input: unknown): UpdateReportInput {
    return updateReportInputSchema.parse(input);
  }

  async handler(input: UpdateReportInput, context: McpAuthContext): Promise<McpToolResult> {
    const {
      report_id,
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

    // filters and slices are mapped separately: each replaces only its own kind
    // of stored rule (post-join vs pre-join), so updating one never wipes the other.
    const request = {
      reportId: report_id,
      fields,
      postJoinFilters: filters !== undefined ? mapReportFilters(undefined, filters) : undefined,
      preJoinFilters: slices !== undefined ? mapReportFilters(slices, undefined) : undefined,
      aggregationConfig: mapReportAggregations(aggregations),
      dateTruncConfig: mapReportDateBuckets(date_buckets),
      sortConfig: mapReportSort(sort),
      limitConfig: limit,
      name,
      message,
      runImmediately: run_immediately,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    };

    let result;
    try {
      result = await this.reports.updateReport(request);
    } catch (err) {
      rethrowTranslatedOutputControlsError(err);
    }

    const { run, ...report } = result;
    return jsonToolResult({
      ...report,
      run: toReportRunOutcomeOutput(
        run,
        this.runMessages(run_immediately, isEmailFamily(report.destination_type))
      ),
    });
  }

  /**
   * The not_requested wording depends on WHY: an explicit run_immediately=false,
   * the email-family default (a run would re-send the message), and the default
   * for a name/message-only change each call for different advice.
   */
  private runMessages(
    runImmediately: boolean | undefined,
    emailFamily: boolean
  ): ReportRunOutcomeMessages {
    let notRequested: string;
    if (runImmediately === false) {
      notRequested =
        'The report was updated without a run because run_immediately was false. The destination still shows the previous data; call run_report when the user wants it refreshed.';
    } else if (emailFamily) {
      notRequested =
        'The report was updated but not re-sent: a run would deliver the message to every configured recipient or channel, so it is not queued by default. Call run_report, or repeat with run_immediately=true, only if the user explicitly wants it sent now.';
    } else {
      notRequested =
        'The report was updated without a run: what it exports did not change (only the name or message changed, or the same controls were re-sent), so there was nothing new to deliver. Call run_report, or repeat with run_immediately=true, if the user wants it re-delivered anyway.';
    }
    return {
      queued:
        'The report was updated and a refresh run was queued. Poll get_report_run_status with this report_id and run_id until should_poll is false. Do not call run_report for this refresh.',
      not_requested: notRequested,
      not_applicable:
        'The report was updated. It uses a pull-based destination, so no run is applicable.',
      failed_to_queue:
        'The report was updated, but the refresh run could not be queued, so the destination still shows the previous data. Do not call update_report again; retry delivery with run_report using this report_id.',
    };
  }
}
