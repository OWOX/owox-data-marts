/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInAdsFieldsSchema = {
  "adAccounts": {
    "overview": "Ad Accounts",
    "description": "Advertising accounts for an organization.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-accounts",
    "fields": adAccountFields,
    "uniqueKeys": ["id"]
  },
  "adCampaignGroups": {
    "overview": "Campaign Groups",
    "description": "Group campaigns under an account.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaign-groups",
    "fields": adCampaignGroupFields,
    "uniqueKeys": ["id"]
  },
  "adCampaigns": {
    "overview": "Campaigns",
    "description": "Ad campaigns with scheduling, targeting, budgeting and other settings.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns",
    "fields": adCampaignFields,
    "uniqueKeys": ["id"]
  },
  "creatives": {
    "overview": "Creatives",
    "description": "Ad creative objects.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-creatives",
    "fields": creativesFields,
    "uniqueKeys": ["id"]
  },
  "adAnalytics": {
    "overview": "LinkedIn Ads Analytics Report",
    "description": "Provides analytics data for LinkedIn advertising campaigns",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": adAnalyticsFields,
    "uniqueKeys": ["dateRange", "pivotValues"],
    "isTimeSeries": true
  }
}
