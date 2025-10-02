// TypeScript interfaces for Data Collections feature

export interface CollectionJob {
  id: string
  user_id: string
  platform_credential_id: number
  platform_name: string
  collection_name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_records?: number
  records_collected: number
  records_failed: number
  progress_percentage: number
  started_at?: string
  completed_at?: string
  error_message?: string
  error_details?: any
  collection_params?: any
  result_summary?: any
  created_at: string
  updated_at?: string
}

export interface CollectionParameters {
  platform_credential_id: number
  collection_name: string
  start_date: string
  end_date: string
  fields: string[]
  [key: string]: any // Allow for platform-specific parameters
}
export interface LinkedInAccount {
  id: string
  name: string
  status: string
  type: string
  totalBudget?: {
    amount: string
    currencyCode: string
  }
}

export interface PlatformCredential {
  id: number
  platform_name: string
  account_name: string
  status: string
  created_at: string
  updated_at: string
}

export interface LinkedInDataCollectionRequest {
  platform_credential_id: number
  account_urns: string[]
  start_date: string
  end_date: string
  fields: string[]
}

export interface LinkedInDataCollectionResponse {
  status: 'success' | 'error'
  records_collected: number
  data?: any[]
  error?: string
}

export interface LinkedInFieldsResponse {
  fields: string[]
  field_count: number
}

// Form state interface
export interface CollectionFormData {
  platform_credential_id: string
  account_urns: string[]
  start_date: string
  end_date: string
  fields: string[]
}

// LinkedIn field categories for better UX
export interface LinkedInFieldCategory {
  name: string
  description: string
  fields: string[]
  color: string
}

export const LINKEDIN_FIELD_CATEGORIES: LinkedInFieldCategory[] = [
  {
    name: 'Essential',
    description: 'Required fields for basic reporting',
    fields: ['dateRange', 'pivotValues', 'impressions', 'clicks', 'costInUsd'],
    color: 'blue'
  },
  {
    name: 'Performance',
    description: 'Core performance metrics',
    fields: ['impressions', 'clicks', 'costInUsd', 'costInLocalCurrency', 'approximateUniqueImpressions'],
    color: 'green'
  },
  {
    name: 'Video Metrics',
    description: 'Video engagement metrics',
    fields: ['videoViews', 'videoFirstQuartileCompletions', 'videoMidpointCompletions', 'videoThirdQuartileCompletions', 'videoCompletions', 'fullScreenPlays'],
    color: 'purple'
  },
  {
    name: 'Engagement',
    description: 'Social engagement metrics',
    fields: ['reactions', 'comments', 'shares', 'follows', 'otherEngagements'],
    color: 'pink'
  },
  {
    name: 'Conversions',
    description: 'Conversion and lead generation metrics',
    fields: ['externalWebsiteConversions', 'externalWebsitePostClickConversions', 'externalWebsitePostViewConversions', 'oneClickLeads', 'oneClickLeadFormOpens', 'leadGenerationMailContactInfoShares', 'leadGenerationMailInterestedClicks'],
    color: 'orange'
  },
  {
    name: 'Viral Metrics',
    description: 'Viral and organic engagement',
    fields: ['viralImpressions', 'viralClicks', 'viralReactions', 'viralComments', 'viralShares', 'viralFollows', 'viralCompanyPageClicks', 'viralOtherEngagements'],
    color: 'indigo'
  },
  {
    name: 'Other',
    description: 'Additional metrics',
    fields: ['opens', 'sends', 'textUrlClicks', 'companyPageClicks', 'actionClicks', 'adUnitClicks', 'landingPageClicks'],
    color: 'gray'
  }
]

// API response status types
export type ApiStatus = 'idle' | 'loading' | 'success' | 'error'

export interface ApiState<T> {
  status: ApiStatus
  data: T | null
  error: string | null
}
