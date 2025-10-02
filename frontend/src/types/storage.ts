/**
 * TypeScript types for the storage system
 */

export enum StorageType {
  BIGQUERY = 'bigquery',
  SHEETS = 'sheets',
  ATHENA = 'athena',
  CSV = 'csv',
  POSTGRES = 'postgres'
}

export interface SchemaField {
  name: string
  field_type: string
  bigquery_type?: string
  athena_type?: string
  sheets_format?: string
  description?: string
  partitioned?: boolean
}

// Storage Configuration Types
export interface StorageConfigBase {
  max_buffer_size?: number
  description?: string
}

export interface BigQueryConfig extends StorageConfigBase {
  destination_project_id: string
  destination_dataset_id: string
  destination_table_name: string
  location?: string
  service_account_json?: string
  clustering_fields?: string[]
  partitioning_field?: string
  partitioning_type?: 'DAY' | 'HOUR' | 'MONTH' | 'YEAR'
  write_disposition?: 'WRITE_TRUNCATE' | 'WRITE_APPEND' | 'WRITE_EMPTY'
}

export interface GoogleSheetsConfig extends StorageConfigBase {
  destination_spreadsheet_id: string
  destination_sheet_name?: string
  cleanup_window_days?: number
  service_account_json?: string
  header_row?: number
  start_row?: number
  preserve_formatting?: boolean
}

export interface AthenaConfig extends StorageConfigBase {
  aws_region: string
  s3_bucket_name: string
  s3_prefix?: string
  athena_database_name: string
  athena_output_location: string
  aws_access_key_id?: string
  aws_secret_access_key?: string
  table_format?: 'HIVE' | 'ICEBERG'
  compression?: 'NONE' | 'GZIP' | 'SNAPPY' | 'LZ4'
}

export interface CsvConfig extends StorageConfigBase {
  file_path: string
  delimiter?: string
  quote_char?: string
  encoding?: string
  write_headers?: boolean
  append_mode?: boolean
  backup_existing?: boolean
  max_file_size_mb?: number
  enable_rotation?: boolean
  rotation_size_mb?: number
  max_files?: number
}

export interface PostgresConfig extends StorageConfigBase {
  host: string
  port?: number
  database: string
  username: string
  password: string
  table_name: string
  schema_name?: string
  ssl_mode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'
  connection_timeout?: number
  pool_size?: number
  max_overflow?: number
  create_table_if_not_exists?: boolean
  auto_add_columns?: boolean
  use_transactions?: boolean
}

export type StorageConfig = BigQueryConfig | GoogleSheetsConfig | AthenaConfig | CsvConfig | PostgresConfig

// Storage Destination Types
export interface StorageDestinationBase {
  name: string
  storage_type: StorageType
  unique_key_columns: string[]
  description?: string
}

export interface StorageDestinationCreate extends StorageDestinationBase {
  configuration: StorageConfig
  platform_credential_id?: string
  schema_definition?: SchemaField[]
}

export interface StorageDestinationUpdate {
  name?: string
  configuration?: StorageConfig
  unique_key_columns?: string[]
  schema_definition?: SchemaField[]
  description?: string
  is_active?: boolean
}

export interface StorageDestination extends StorageDestinationBase {
  id: string
  configuration: StorageConfig
  platform_credential_id?: string
  created_by_id: string
  project_id: string
  schema_definition?: SchemaField[]
  is_active: boolean
  created_at: string
  updated_at?: string
  deleted_at?: string
}

// Execution Types
export interface StorageExecutionRequest {
  storage_destination_id: string
  data: Record<string, any>[]
  source_platform?: string
  source_data_type?: string
  data_range_start?: string
  data_range_end?: string
  execution_config?: Record<string, any>
}

export interface DataMartExecution {
  id: string
  storage_destination_id: string
  execution_status: 'pending' | 'running' | 'completed' | 'failed'
  records_processed: number
  records_failed: number
  execution_time_seconds?: number
  error_message?: string
  error_details?: Record<string, any>
  storage_details?: Record<string, any>
  source_platform?: string
  source_data_type?: string
  data_range_start?: string
  data_range_end?: string
  created_by_id: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at?: string
}

// Validation Types
export interface StorageValidation {
  id?: string
  storage_destination_id?: string
  is_valid: boolean
  validation_message?: string
  validation_details?: Record<string, any>
  response_time_ms?: number
  validated_at?: string
}

// Metrics Types
export interface ExecutionSummary {
  total_executions: number
  successful_executions: number
  failed_executions: number
  total_records_processed: number
  average_execution_time?: number
  last_execution?: string
}

export interface StorageMetrics {
  storage_destination_id: string
  total_executions: number
  recent_executions: DataMartExecution[]
  execution_summary: ExecutionSummary
  validation_status?: StorageValidation
}

// Utility Types
export interface StorageTypeInfo {
  type: StorageType
  name: string
  description: string
  capabilities: string[]
  required_credentials: string[]
  max_buffer_size: number
}

export interface ValidationResult {
  is_valid: boolean
  errors?: string[]
  warnings?: string[]
}

export interface ConnectionTestResult {
  is_valid: boolean
  message: string
  response_time_ms?: number
  details?: Record<string, any>
}
