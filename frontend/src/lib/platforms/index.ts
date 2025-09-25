import { PlatformInfo } from '@/types/platform-credential'

export const SUPPORTED_PLATFORMS: PlatformInfo[] = [
  {
    name: 'facebook',
    display_name: 'Facebook Ads',
    description: 'Connect to Facebook Ads Manager to collect campaign data, ad performance metrics, and audience insights.',
    icon: '📘',
    documentation_url: 'https://developers.facebook.com/docs/marketing-api',
    fields: [
      {
        name: 'app_id',
        label: 'App ID',
        type: 'text',
        required: true,
        placeholder: '1234567890123456',
        description: 'Your Facebook App ID from the Facebook Developer Console'
      },
      {
        name: 'app_secret',
        label: 'App Secret',
        type: 'password',
        required: true,
        description: 'Your Facebook App Secret (keep this secure)'
      },
      {
        name: 'access_token',
        label: 'Access Token',
        type: 'password',
        required: true,
        description: 'Long-lived user access token with ads_read permissions'
      }
    ]
  },
  {
    name: 'linkedin',
    display_name: 'LinkedIn Ads',
    description: 'Collect campaign performance data and audience insights from LinkedIn Campaign Manager.',
    icon: '💼',
    documentation_url: 'https://docs.microsoft.com/en-us/linkedin/marketing/',
    fields: [
      {
        name: 'client_id',
        label: 'Client ID',
        type: 'text',
        required: true,
        placeholder: '1234567890',
        description: 'LinkedIn application Client ID'
      },
      {
        name: 'client_secret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        description: 'LinkedIn application Client Secret'
      },
      {
        name: 'access_token',
        label: 'Access Token',
        type: 'password',
        required: true,
        description: 'OAuth 2.0 access token with r_ads and r_ads_reporting permissions'
      }
    ]
  },
  {
    name: 'tiktok',
    display_name: 'TikTok Ads',
    description: 'Access TikTok for Business data including campaign metrics and audience analytics.',
    icon: '🎵',
    documentation_url: 'https://ads.tiktok.com/marketing_api/docs',
    fields: [
      {
        name: 'app_id',
        label: 'App ID',
        type: 'text',
        required: true,
        placeholder: '1234567890123456789',
        description: 'TikTok for Business App ID'
      },
      {
        name: 'secret',
        label: 'App Secret',
        type: 'password',
        required: true,
        description: 'TikTok for Business App Secret'
      },
      {
        name: 'access_token',
        label: 'Access Token',
        type: 'password',
        required: true,
        description: 'Long-term access token for TikTok Marketing API'
      }
    ]
  },
  {
    name: 'google_ads',
    display_name: 'Google Ads',
    description: 'Connect to Google Ads to collect campaign data, keywords performance, and conversion metrics.',
    icon: '🔍',
    documentation_url: 'https://developers.google.com/google-ads/api',
    fields: [
      {
        name: 'client_id',
        label: 'Client ID',
        type: 'text',
        required: true,
        description: 'Google OAuth 2.0 Client ID'
      },
      {
        name: 'client_secret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        description: 'Google OAuth 2.0 Client Secret'
      },
      {
        name: 'refresh_token',
        label: 'Refresh Token',
        type: 'password',
        required: true,
        description: 'OAuth 2.0 refresh token'
      },
      {
        name: 'developer_token',
        label: 'Developer Token',
        type: 'password',
        required: true,
        description: 'Google Ads API Developer Token'
      }
    ]
  }
]

export function getPlatformInfo(platformName: string): PlatformInfo | undefined {
  return SUPPORTED_PLATFORMS.find(platform => platform.name === platformName)
}
