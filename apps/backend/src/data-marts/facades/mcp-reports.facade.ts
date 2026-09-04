import type { ReportRunStatus } from '../enums/report-run-status.enum';
import type { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import type { AggregationConfig } from '../dto/schemas/aggregation-config.schema';
import type { DateTruncConfig } from '../dto/schemas/date-trunc-config.schema';
import type { FilterConfig } from '../dto/schemas/filter-config.schema';
import type { SortConfig } from '../dto/schemas/sort-config.schema';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import type { McpDestinationType } from './mcp-destination-type';
import type { McpReportOutputControls } from './mcp-report-output-controls';

export const MCP_REPORTS_FACADE = Symbol('MCP_REPORTS_FACADE');

export interface McpGetDataMartReportsRequest {
  dataMartId: string;
  projectId: string;
  userId: string;
  roles: string[];
}

/**
 * One REPORT_RUN scheduled trigger of a report. A report can have any number
 * of schedules; the field vocabulary matches the report-run-schedule MCP tools,
 * so `trigger_id` can be passed to them directly.
 */
export interface McpReportScheduleItem {
  trigger_id: string;
  cron_expression: string;
  time_zone: string;
  is_active: boolean;
  /** ISO 8601 timestamp of the next scheduled run, or `null`. */
  next_run_at: string | null;
  /** ISO 8601 timestamp of the trigger's last run, or `null` when it never ran. */
  last_run_at: string | null;
}

/**
 * Google Sheets identifiers of a report, so an agent can hand the user the sheet
 * link and put a follow-up export into the SAME document (add_report
 * `spreadsheetId`). Present only for Google Sheets reports.
 */
export interface McpReportSheetInfo {
  spreadsheet_id?: string;
  sheet_url?: string;
}

/**
 * What identifies and defines a report, shared by the list item and the
 * similar-report error: enough for an agent to recognise "the report I created a
 * moment ago" and to build an update_report call that keeps what it does not
 * mean to change.
 */
export interface McpReportSummary extends McpReportOutputControls, McpReportSheetInfo {
  report_id: string;
  /** Id of the parent data mart, echoed so each item is self-describing. */
  data_mart_id: string;
  name: string;
  destination_id: string;
  destination_type: McpDestinationType;
  /** ISO 8601 creation timestamp. */
  created_at: string;
}

export interface McpReportListItem extends McpReportSummary {
  owner: string | null;
  /** True when the requesting MCP user created the report. */
  created_by_current_user: boolean;
  /** All REPORT_RUN schedules of the report; empty when unscheduled. */
  schedules: McpReportScheduleItem[];
  /** ISO 8601 timestamp of the report's last run, or `null` when it never ran. */
  last_run_at: string | null;
  /** Status of the report's last run, or `null` when it never ran. */
  last_run_status: ReportRunStatus | null;
}

export interface McpGetDataMartReportsResponse {
  reports: McpReportListItem[];
}

/**
 * Message settings for email-family destinations (email, Slack, Microsoft
 * Teams, Google Chat). Recipients and channels are configured on the
 * destination itself, not on the report.
 */
export interface McpAddReportMessage {
  /** Message subject / heading. Defaults to the report name. */
  subject?: string;
  /** Message body template (CUSTOM_MESSAGE); supports the `{{table}}` placeholder. */
  body: string;
}

export interface McpAddReportRequest {
  dataMartId: string;
  destinationId: string;
  /** Column names to include; `['*']` (or containing `'*'`) selects every field. */
  fields: string[];
  /**
   * Row filter rules applied on every report run (already mapped to the domain
   * vocabulary; includes pre-join slice rules). Omitted, `null`, or empty — no
   * row filtering.
   */
  filterConfig?: FilterConfig;
  /** Aggregations applied on every run (domain vocabulary). Omitted or `null` — raw rows. */
  aggregationConfig?: AggregationConfig;
  /** Date-trunc buckets applied on every run. Omitted or `null` — none. */
  dateTruncConfig?: DateTruncConfig;
  /** Sort order of the exported rows. Omitted or `null` — storage default. */
  sortConfig?: SortConfig;
  /** Max rows per run. Omitted or `null` — no cap. */
  limitConfig?: number | null;
  /**
   * Report name (also the new sheet's title and the default email subject).
   * Required for Google Sheets and email-family destinations; rejected for
   * Looker Studio, whose reports carry no name.
   */
  name?: string;
  /** Required for email-family destinations; rejected for any other type. */
  message?: McpAddReportMessage;
  /**
   * Whether to enqueue the first Report Run after creating the report. Omitted
   * means true for push destinations and false for pull-based destinations.
   */
  runImmediately?: boolean;
  /**
   * Google Sheets only: add the report as a new sheet (tab) of this existing
   * spreadsheet instead of creating a new file. Rejected for other types.
   */
  spreadsheetId?: string;
  /**
   * Skip the similar-report guard: by default a report is refused when the
   * requesting user already has one exporting the same fields from the same
   * data mart to the same destination (see McpSimilarReportExistsException).
   */
  allowSimilar?: boolean;
  projectId: string;
  userId: string;
  /** Requesting user email — the auto-created sheet is shared with them (best-effort). */
  userEmail?: string;
  roles: string[];
}

/**
 * Thrown by addReport when the requesting user already has a report with the
 * same field selection on the same data mart and destination — the case where
 * "add a filter" should become update_report, not a second report. Carries the
 * existing report so the caller can name it and update it.
 */
export class McpSimilarReportExistsException extends BusinessViolationException {
  constructor(readonly existingReport: McpReportSummary) {
    super(
      `A report exporting the same fields already exists: "${existingReport.name}" ` +
        `(report_id ${existingReport.report_id}), created by you on this data mart and destination. ` +
        'Change it with update_report instead of creating another one, or pass allow_similar=true ' +
        'if the user explicitly wants a separate report.',
      { reportId: existingReport.report_id }
    );
    this.name = 'McpSimilarReportExistsException';
  }
}

/**
 * Outcome of a Report Run a write tool queues on the caller's behalf (the first
 * run of add_report, the refresh run of update_report). The report change is
 * committed for every outcome.
 */
export type McpReportRunOutcome =
  | { status: 'queued'; run_id: string }
  | { status: 'not_requested' }
  | { status: 'not_applicable' }
  | { status: 'failed_to_queue'; error: string };

export type McpAddReportInitialRunResult = McpReportRunOutcome;

export interface McpAddReportResult {
  report_id: string;
  /** Type of the report's destination — lets the tool layer add per-type guidance. */
  destination_type: McpDestinationType;
  owner: string | null;
  status: 'created';
  /** Outcome of the automatic first run. The report exists for every outcome. */
  initial_run: McpAddReportInitialRunResult;
  /** Id of the spreadsheet the report writes to. Google Sheets destinations only. */
  spreadsheet_id?: string;
  /** Link to the report's sheet (tab). Google Sheets destinations only. */
  sheet_url?: string;
  /** True when the configured Drive folder could not be used and the sheet landed in the Drive root. Google Sheets destinations only, new files only. */
  placed_in_root?: boolean;
  /**
   * New file: false when it could not be shared with the requesting user.
   * Existing spreadsheet: false when their access could not be confirmed
   * (never granted). Google Sheets destinations only.
   */
  shared_with_requester?: boolean;
}

/**
 * Partial message changes for an email-family report. At least one field must
 * be provided when the group itself is present.
 */
export interface McpUpdateReportMessage {
  /** New message subject / heading. Omit to keep the current one. */
  subject?: string;
  /**
   * New message body template; supports the `{{table}}` placeholder. Setting
   * it switches the report to a CUSTOM_MESSAGE template source, replacing an
   * insight template if one was configured. Omit to keep the current source.
   */
  body?: string;
}

export interface McpUpdateReportRequest {
  reportId: string;
  /** Replacement column selection; `['*']` (or containing `'*'`) selects every field. Omit to keep the current selection. */
  fields?: string[];
  /**
   * Replacement post-join filter rules (the tool's `filters`). Replaces only
   * the report's current post-join rules — stored pre-join (slice) rules are
   * untouched; `null` removes every post-join rule. Omit to keep current.
   */
  postJoinFilters?: FilterConfig;
  /**
   * Replacement pre-join slice rules (the tool's `slices`). Replaces only the
   * report's current pre-join rules — stored post-join rules are untouched;
   * `null` removes every pre-join rule. Omit to keep current.
   */
  preJoinFilters?: FilterConfig;
  /** Replacement aggregations; `null` removes them. Omit to keep current. */
  aggregationConfig?: AggregationConfig;
  /** Replacement date-trunc buckets; `null` removes them. Omit to keep current. */
  dateTruncConfig?: DateTruncConfig;
  /** Replacement sort order; `null` removes it. Omit to keep current. */
  sortConfig?: SortConfig;
  /** New max rows per run; `null` removes the cap. Omit to keep current. */
  limitConfig?: number | null;
  /** New report name. Omit to keep the current name. */
  name?: string;
  /** Message changes — only valid when the report's destination is email-family. */
  message?: McpUpdateReportMessage;
  /**
   * Whether to enqueue a Report Run after the update so the destination reflects
   * it. Omitted means: run a Google Sheets report when the update changed what
   * it exports (fields or any output control); never for a name-only or
   * message-only change, never for email-family reports (a run re-sends the
   * message to every recipient or channel), never for pull-based destinations.
   */
  runImmediately?: boolean;
  projectId: string;
  userId: string;
  roles: string[];
}

/**
 * The report as it is AFTER the update — the agent confirms the resulting
 * export instead of trusting the diff it sent — plus the outcome of the
 * refresh run.
 */
export interface McpUpdateReportResult extends McpReportOutputControls, McpReportSheetInfo {
  report_id: string;
  status: 'updated';
  destination_type: McpDestinationType;
  name: string;
  run: McpReportRunOutcome;
}

export interface McpDeleteReportRequest {
  reportId: string;
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpDeleteReportResult {
  report_id: string;
  status: 'deleted';
}

export interface McpRunReportRequest {
  projectId: string;
  userId: string;
  roles: string[];
  reportId: string;
}

export interface McpRunReportResponse {
  reportId: string;
  runId: string;
}

export const MCP_REPORT_RUN_STATUSES = [
  'running',
  'success',
  'failed',
  'cancelled',
  'interrupted',
  'restricted',
] as const;

export type McpReportRunStatus = (typeof MCP_REPORT_RUN_STATUSES)[number];

export interface McpGetReportRunStatusRequest {
  projectId: string;
  userId: string;
  roles: string[];
  reportId: string;
  runId: string;
}

export interface McpGetReportRunStatusResponse {
  reportId: string;
  runId: string;
  status: McpReportRunStatus;
  queuedAt: string | null;
  startedAt: string | null;
  rawStatus: DataMartRunStatus;
  error: string | null;
}

export interface McpGetReportOutputSchemaRequest {
  projectId: string;
  userId: string;
  roles: string[];
  reportId: string;
}

/** One column of a report's output, as a reader of the rows would name and understand it. */
export interface McpReportOutputSchemaColumn {
  /** The key each output row is keyed by. */
  name: string;
  /** The alias configured for the column; null when there is none. */
  title: string | null;
  description: string | null;
  /** Storage field type, null when it cannot be derived (e.g. an SQL-override column). */
  type: string | null;
  /** The aggregate function the report applies to this column; null when it applies none. */
  aggregateFunction: string | null;
  /**
   * Set only for a calculated field: `metric` means the formula aggregates and must NOT be
   * re-aggregated at any grain, `column` means it is row-level with no warehouse column behind it.
   * Null is an ordinary native column a consumer may roll up — not "unknown".
   */
  calculatedFieldLevel: string | null;
}

export interface McpGetReportOutputSchemaResponse {
  reportId: string;
  columns: McpReportOutputSchemaColumn[];
}

export interface McpReportsFacade {
  getDataMartReports(request: McpGetDataMartReportsRequest): Promise<McpGetDataMartReportsResponse>;
  /**
   * Creates a report, branching on the destination's type. Google Sheets:
   * auto-creates a new Sheet, then creates the report pointing at it (the
   * result carries the sheet fields). Looker Studio: creates the report with
   * the default destination settings — no extra input is accepted. Email
   * family (email, Slack, Microsoft Teams, Google Chat): requires `message`;
   * the send condition is not exposed and defaults to "send always". Push
   * destinations queue their first run by default unless `runImmediately` is
   * false; `initial_run` reports the queue outcome for every created report.
   * Unless `allowSimilar` is set, a report whose field selection duplicates one
   * the requesting user already created on the same data mart and destination
   * is refused with McpSimilarReportExistsException — before any side effect.
   * Google Sheets with `spreadsheetId`: adds a sheet to that spreadsheet instead
   * of creating a new file.
   */
  addReport(request: McpAddReportRequest): Promise<McpAddReportResult>;
  /**
   * Partially updates a report (name, column selection, output controls —
   * filters, aggregations, date buckets, sort, limit — and/or, for
   * email-family reports, the message subject/body). The domain update
   * command requires the full report state, so the facade loads the current
   * report and merges the requested changes into it; everything else
   * (destination, owners, send condition, …) is preserved as-is.
   * At least one change must be provided — a call with nothing to change is
   * rejected by the implementation, independent of the tool-layer validation.
   * `message` is rejected for non-email-family reports. Returns the report's
   * resulting output controls and the outcome of the refresh run (queued by
   * default only for a Google Sheets report whose export changed).
   */
  updateReport(request: McpUpdateReportRequest): Promise<McpUpdateReportResult>;
  /**
   * Deletes a report. Deleting an unknown id is a not-found error, not a
   * no-op. The domain service returns void, so the result status is
   * synthesized; external cleanup (e.g. Google Sheets metadata) runs
   * asynchronously via the report.deleted event and is not awaited.
   */
  deleteReport(request: McpDeleteReportRequest): Promise<McpDeleteReportResult>;
  runReport(request: McpRunReportRequest): Promise<McpRunReportResponse>;
  getReportRunStatus(request: McpGetReportRunStatusRequest): Promise<McpGetReportRunStatusResponse>;
  /**
   * The columns a report's rows will carry, in the order they are projected — the names to put
   * above the values `query_data_mart` and the HTTP data stream return.
   *
   * Includes the columns the report synthesises (aggregated `revenue | SUM`, Unique Count,
   * calculated fields), which appear in no Data Mart schema. Resolved from the stored schema and
   * the report config, so it answers without reading any report data.
   */
  getReportOutputSchema(
    request: McpGetReportOutputSchemaRequest
  ): Promise<McpGetReportOutputSchemaResponse>;
}
