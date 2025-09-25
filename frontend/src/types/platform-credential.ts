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
  granted_permissions?: string[]
  created_at: string
  updated_at?: string
}

export interface PlatformCredentialCreate {
  platform_name: string
  platform_display_name: string
  account_name?: string
  credentials: Record<string, any>
}

export interface PlatformCredentialUpdate {
  platform_display_name?: string
  account_name?: string
  is_active?: boolean
  credentials?: Record<string, any>
}

export interface PlatformInfo {
  name: string
  display_name: string
  description: string
  icon: string
  fields: CredentialField[]
  documentation_url?: string
}

export interface CredentialField {
  name: string
  label: string
  type: 'text' | 'password' | 'url' | 'select'
  required: boolean
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[]
}
