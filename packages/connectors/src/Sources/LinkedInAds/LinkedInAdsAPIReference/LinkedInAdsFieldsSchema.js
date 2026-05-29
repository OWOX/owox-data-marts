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
    "defaultFields": ["name", "currency"],
    "destinationName": "linkedin_ads_ad_accounts"
  },
  "adCampaignGroups": {
    "overview": "Campaign Groups",
    "description": "Top-level containers that group campaigns with shared objectives, budgets, and scheduling.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaign-groups",
    "fields": adCampaignGroupFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["name", "status", "account"],
    "destinationName": "linkedin_ads_ad_campaign_groups"
  },
  "adCampaigns": {
    "overview": "Campaigns",
    "description": "Individual campaigns defining your targeting, ad format, bid strategy, and budget.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns",
    "fields": adCampaignFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["account", "costType", "dailyBudget", "locale", "name", "objectiveType", "totalBudget", "type", "unitCost", "status", "format"],
    "destinationName": "linkedin_ads_ad_campaigns"
  },
  "creatives": {
    "overview": "Creatives",
    "description": "The visual and copy elements of your ads shown to members across LinkedIn.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-creatives",
    "fields": creativesFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["account", "intendedStatus", "name"],
    "destinationName": "linkedin_ads_creatives"
  },
  "adAnalytics": {
    "overview": "Ad Analytics",
    "description": "Daily performance metrics for your campaigns — impressions, clicks, spend, and conversions.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": adAnalyticsFields,
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "pivotValues"],
    "defaultFields": ["actionClicks", "adUnitClicks", "approximateMemberReach", "clicks", "commentLikes", "comments", "companyPageClicks", "conversionValueInLocalCurrency", "costInLocalCurrency", "costInUsd", "externalWebsiteConversions", "externalWebsitePostClickConversions", "externalWebsitePostViewConversions", "follows", "impressions", "landingPageClicks", "leadGenerationMailContactInfoShares", "leadGenerationMailInterestedClicks", "likes", "oneClickLeadFormOpens", "oneClickLeads", "opens", "otherEngagements", "reactions", "sends", "shares", "textUrlClicks", "totalEngagements", "viralClicks", "viralCommentLikes", "viralComments", "viralCompanyPageClicks", "viralExternalWebsiteConversions", "viralExternalWebsitePostClickConversions", "viralFollows", "viralImpressions", "viralLandingPageClicks", "viralLikes", "viralOneClickLeadFormOpens", "viralOneClickLeads", "viralOtherEngagements", "viralReactions", "viralShares", "viralTotalEngagements"],
    "destinationName": "linkedin_ads_ad_analytics",
    "isTimeSeries": true
  }
}
