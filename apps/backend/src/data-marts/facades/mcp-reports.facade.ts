import type { ReportRunStatus } from '../enums/report-run-status.enum';
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

export interface McpReportsFacade {
  getDataMartReports(request: McpGetDataMartReportsRequest): Promise<McpGetDataMartReportsResponse>;
}
