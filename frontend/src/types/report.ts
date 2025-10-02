/**
 * TypeScript types for Reports
 */

export enum ReportStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

export enum ReportType {
  DASHBOARD = 'dashboard',
  TABLE = 'table',
  CHART = 'chart',
  EXPORT = 'export'
}

export interface Report {
  id: string
  data_mart_id: string
  title: string
  description?: string
  report_type: ReportType
  status: ReportStatus
  config?: Record<string, any>
  query?: string
  is_public: boolean
  share_token?: string
  view_count: string
  last_viewed_at?: string
  project_id: string
  created_by_id: string
  created_at: string
  updated_at?: string
  deleted_at?: string
}

export interface ReportCreate {
  data_mart_id: string
  title: string
  description?: string
  report_type: ReportType
  is_public?: boolean
  report_config?: Record<string, any>
}

export interface ReportUpdate {
  title?: string
  description?: string
  status?: ReportStatus
  report_config?: Record<string, any>
  is_public?: boolean
}
