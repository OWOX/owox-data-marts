export enum DataMartStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error'
}

export enum DataMartType {
  CONNECTOR = 'connector',
  SQL = 'sql',
  TABLE = 'table'
}

export interface DataMart {
  id: number
  user_id: number
  title: string
  description?: string
  mart_type: DataMartType
  status: DataMartStatus
  source_platform?: string
  sql_query?: string
  configuration?: Record<string, any>
  is_scheduled: boolean
  schedule_config?: Record<string, any>
  last_run_at?: string
  next_run_at?: string
  created_at: string
  updated_at?: string
}

export interface DataMartCreate {
  title: string
  description?: string
  mart_type: DataMartType
  source_platform?: string
  sql_query?: string
  configuration?: Record<string, any>
  is_scheduled?: boolean
  schedule_config?: Record<string, any>
}

export interface DataMartUpdate {
  title?: string
  description?: string
  status?: DataMartStatus
  configuration?: Record<string, any>
  sql_query?: string
  is_scheduled?: boolean
  schedule_config?: Record<string, any>
}
