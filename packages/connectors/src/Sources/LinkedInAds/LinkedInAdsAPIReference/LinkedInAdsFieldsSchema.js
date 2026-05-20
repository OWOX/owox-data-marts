/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInAdsFieldsSchema = {
  "adAccounts": {
    "overview": "Ad Accounts",
    "description": "Your ad account settings, billing details, currency, and account status.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-accounts",
    "fields": adAccountFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["id", "name", "status", "currency", "type", "reference"],
    "destinationName": "linkedin_ads_ad_accounts"
  },
  "adCampaignGroups": {
    "overview": "Campaign Groups",
    "description": "Top-level containers that group campaigns with shared objectives, budgets, and scheduling.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaign-groups",
    "fields": adCampaignGroupFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["id", "name", "status", "account", "objectiveType", "runSchedule", "totalBudget", "servingStatuses"],
    "destinationName": "linkedin_ads_ad_campaign_groups"
  },
  "adCampaigns": {
    "overview": "Campaigns",
    "description": "Individual campaigns defining your targeting, ad format, bid strategy, and budget.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns",
    "fields": adCampaignFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["id", "name", "status", "account", "campaignGroup", "objectiveType", "type", "runSchedule"],
    "destinationName": "linkedin_ads_ad_campaigns"
  },
  "creatives": {
    "overview": "Creatives",
    "description": "The visual and copy elements of your ads shown to members across LinkedIn.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-creatives",
    "fields": creativesFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["id", "name", "intendedStatus", "account", "campaign", "isServing", "createdAt"],
    "destinationName": "linkedin_ads_creatives"
  },
  "adAnalytics": {
    "overview": "Ad Analytics",
    "description": "Daily performance metrics for your campaigns — impressions, clicks, spend, and conversions.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": adAnalyticsFields,
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "pivotValues"],
    "defaultFields": ["dateRangeStart", "dateRangeEnd", "pivotValues", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "totalEngagements", "landingPageClicks", "externalWebsiteConversions"],
    "destinationName": "linkedin_ads_ad_analytics",
    "isTimeSeries": true
  }
}
