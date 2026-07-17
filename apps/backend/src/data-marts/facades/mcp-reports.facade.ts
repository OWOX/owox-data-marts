import type { ReportRunStatus } from '../enums/report-run-status.enum';
import type { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import type { McpDestinationType } from './mcp-destination-type';

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

export interface McpReportListItem {
  report_id: string;
  /** Id of the parent data mart, echoed so each item is self-describing. */
  data_mart_id: string;
  name: string;
  destination_id: string;
  destination_type: McpDestinationType;
  owner: string | null;
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

export interface McpAddReportRequest {
  dataMartId: string;
  destinationId: string;
  /** Column names to include; `['*']` (or containing `'*'`) selects every field. */
  fields: string[];
  name: string;
  projectId: string;
  userId: string;
  /** Requesting user email — the auto-created sheet is shared with them (best-effort). */
  userEmail?: string;
  roles: string[];
}

export interface McpAddReportResult {
  report_id: string;
  owner: string | null;
  status: 'created';
  /** Link to the auto-created Google Sheet. Google Sheets destinations only. */
  sheet_url?: string;
  /** True when the configured Drive folder could not be used and the sheet landed in the Drive root. Google Sheets destinations only. */
  placed_in_root?: boolean;
  /** False when the created sheet could not be shared with the requesting user. Google Sheets destinations only. */
  shared_with_requester?: boolean;
}

export interface McpUpdateReportRequest {
  reportId: string;
  /** Replacement column selection; `['*']` (or containing `'*'`) selects every field. Omit to keep the current selection. */
  fields?: string[];
  /** New report name. Omit to keep the current name. */
  name?: string;
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpUpdateReportResult {
  report_id: string;
  status: 'updated';
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

export interface McpReportsFacade {
  getDataMartReports(request: McpGetDataMartReportsRequest): Promise<McpGetDataMartReportsResponse>;
  /**
   * Creates a report, branching on the destination's type. Google Sheets:
   * auto-creates a new Sheet, then creates the report pointing at it (the
   * result carries the sheet fields). Looker Studio: creates the report with
   * the default destination settings — no extra input is accepted. Other
   * destination types are rejected with a clear error.
   */
  addReport(request: McpAddReportRequest): Promise<McpAddReportResult>;
  /**
   * Partially updates a report (name and/or column selection). The domain
   * update command requires the full report state, so the facade loads the
   * current report and merges the requested changes into it; everything else
   * (destination, filters, sorting, owners, …) is preserved as-is.
   * At least one of `fields`/`name` must be provided — a call with neither is
   * rejected by the implementation, independent of the tool-layer validation.
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
}
