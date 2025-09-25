/**
 * API utilities for platform integrations
 */
import { apiRequest } from '@/lib/auth'

// Types
export interface PlatformCredential {
  id: number
  platform_name: string
  platform_display_name: string
  account_name?: string
  account_id?: string
  is_active: boolean
  is_valid: boolean
  last_validated_at?: string
  validation_error?: string
  created_at: string
}

export interface LinkedInAccount {
  id: string
  name: string
  status: string
  currency?: string
  type?: string
}

export interface DataCollectionRequest {
  platform_credential_id: number
  account_urns: string[]
  start_date: string
  end_date: string
  fields: string[]
}

export interface GoogleSheetsRequest {
  platform_credential_id: number
  title: string
  headers?: string[]
}

export interface BigQueryDatasetRequest {
  platform_credential_id: number
  dataset_id: string
  description?: string
}

export interface BigQueryTableRequest {
  platform_credential_id: number
  dataset_id: string
  table_id: string
  schema: { name: string; type: string }[]
}

// LinkedIn API
export const linkedInApi = {
  async createCredentials(data: {
    platform_display_name: string
    credentials: { access_token: string }
    account_name?: string
  }): Promise<PlatformCredential> {
    return apiRequest('/platforms/linkedin/credentials', {
      method: 'POST',
      body: JSON.stringify({
        platform_name: 'linkedin',
        ...data,
      }),
    })
  },

  async getAccounts(credentialId: number): Promise<LinkedInAccount[]> {
    return apiRequest(`/platforms/linkedin/credentials/${credentialId}/accounts`)
  },

  async collectData(request: DataCollectionRequest): Promise<{
    status: string
    records_collected: number
    data: any[]
  }> {
    return apiRequest('/platforms/linkedin/collect-data', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  async getFields(): Promise<{ fields: string[]; field_count: number }> {
    return apiRequest('/platforms/linkedin/fields')
  }
}

// Google Sheets API
export const googleSheetsApi = {
  async createCredentials(data: {
    platform_display_name: string
    credentials: any
    account_name?: string
  }): Promise<PlatformCredential> {
    return apiRequest('/platforms/google-sheets/credentials', {
      method: 'POST',
      body: JSON.stringify({
        platform_name: 'google_sheets',
        ...data,
      }),
    })
  },

  async createSpreadsheet(request: GoogleSheetsRequest): Promise<{
    spreadsheet_id: string
    spreadsheet_url: string
    title: string
  }> {
    return apiRequest('/platforms/google-sheets/create-spreadsheet', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  async appendData(data: {
    platform_credential_id: number
    spreadsheet_id: string
    data: any[][]
    sheet_name?: string
  }): Promise<{
    updated_rows: number
    updated_columns: number
  }> {
    return apiRequest('/platforms/google-sheets/append-data', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }
}

// Google BigQuery API
export const googleBigQueryApi = {
  async createCredentials(data: {
    platform_display_name: string
    credentials: any
    account_name?: string
  }): Promise<PlatformCredential> {
    return apiRequest('/platforms/google-bigquery/credentials', {
      method: 'POST',
      body: JSON.stringify({
        platform_name: 'google_bigquery',
        ...data,
      }),
    })
  },

  async createDataset(request: BigQueryDatasetRequest): Promise<{
    dataset_id: string
    project_id: string
    location: string
  }> {
    return apiRequest('/platforms/google-bigquery/create-dataset', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  async createTable(request: BigQueryTableRequest): Promise<{
    table_id: string
    dataset_id: string
    project_id: string
    schema: { name: string; type: string }[]
  }> {
    return apiRequest('/platforms/google-bigquery/create-table', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }
}

// General platform credentials API
export const platformCredentialsApi = {
  async getCredentials(platform?: string): Promise<PlatformCredential[]> {
    const params = platform ? `?platform=${platform}` : ''
    return apiRequest(`/platform-credentials${params}`)
  },

  async getCredential(id: number): Promise<PlatformCredential> {
    return apiRequest(`/platform-credentials/${id}`)
  },

  async updateCredential(id: number, data: Partial<PlatformCredential>): Promise<PlatformCredential> {
    return apiRequest(`/platform-credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async deleteCredential(id: number): Promise<void> {
    return apiRequest(`/platform-credentials/${id}`, {
      method: 'DELETE',
    })
  },

  async validateCredential(id: number): Promise<{
    valid: boolean
    error?: string
    account_info?: any
  }> {
    return apiRequest(`/platform-credentials/${id}/validate`, {
      method: 'POST',
    })
  }
}
