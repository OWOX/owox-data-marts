export enum DataMartStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

export enum DataMartDefinitionType {
  CONNECTOR = 'connector',
  SQL = 'sql',
  TABLE = 'table'
}

export interface DataMart {
  id: string
  title: string
  description?: string
  storage_id: string
  definition_type?: DataMartDefinitionType
  definition?: Record<string, any>
  schema?: Record<string, any>
  status: DataMartStatus
  project_id: string
  created_by_id: string
  created_at: string
  updated_at?: string
  deleted_at?: string
}

export interface DataMartCreate {
  title: string
  description?: string
  storage_id?: string  // Optional - legacy field
  destination_id?: string  // Use this for storage destinations
  definition_type?: DataMartDefinitionType
  definition?: Record<string, any>
  schema?: Record<string, any>
}

export interface DataMartUpdate {
  title?: string
  description?: string
  storage_id?: string
  definition_type?: DataMartDefinitionType
  definition?: Record<string, any>
  schema?: Record<string, any>
  status?: DataMartStatus
}
