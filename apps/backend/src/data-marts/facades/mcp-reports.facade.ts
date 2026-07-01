import type { McpDestinationType } from './mcp-destination-type';

export const MCP_REPORTS_FACADE = Symbol('MCP_REPORTS_FACADE');

export interface McpGetDataMartReportsRequest {
  dataMartId: string;
  projectId: string;
  userId: string;
  roles: string[];
}

export type McpReportStatus = 'active' | 'paused' | 'error';

export const MCP_REPORT_STATUSES = ['active', 'paused', 'error'] as const;

export interface McpReportListItem {
  report_id: string;
  name: string;
  destination_id: string;
  destination_type: McpDestinationType;
  owner: string | null;
  /** Cron expression of the report's active schedule, or `null` when unscheduled. */
  schedule: string | null;
  /** ISO 8601 timestamp of the last run, or `null` when the report never ran. */
  last_run_at: string | null;
  status: McpReportStatus;
}

export interface McpGetDataMartReportsResponse {
  reports: McpReportListItem[];
}

export interface McpReportsFacade {
  getDataMartReports(request: McpGetDataMartReportsRequest): Promise<McpGetDataMartReportsResponse>;
}
