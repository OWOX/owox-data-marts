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
  },
  "adAnalyticsByCountry": {
    "overview": "Ad Analytics by Country",
    "description": "Daily campaign performance by the country of the members who saw your ads — impressions, clicks, spend, and conversions per country.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("country"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "country"],
    "defaultFields": ["account", "countryName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_country",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_COUNTRY_V2",
    "memberField": "country"
  },
  "adAnalyticsByRegion": {
    "overview": "Ad Analytics by Region",
    "description": "Daily campaign performance by the region of the members who saw your ads — impressions, clicks, spend, and conversions per region.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("region"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "region"],
    "defaultFields": ["account", "regionName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_region",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_REGION_V2",
    "memberField": "region"
  },
  "adAnalyticsByCounty": {
    "overview": "Ad Analytics by County",
    "description": "Daily campaign performance by the county of the members who saw your ads — impressions, clicks, spend, and conversions per county.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("county"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "county"],
    "defaultFields": ["account", "countyName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_county",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_COUNTY",
    "memberField": "county"
  },
  "adAnalyticsByCompany": {
    "overview": "Ad Analytics by Company",
    "description": "Daily campaign performance by the company of the members who saw your ads — impressions, clicks, spend, and conversions per company.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("company"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "company"],
    "defaultFields": ["account", "companyName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_company",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_COMPANY",
    "memberField": "company"
  },
  "adAnalyticsByJobTitle": {
    "overview": "Ad Analytics by Job Title",
    "description": "Daily campaign performance by the job title of the members who saw your ads — impressions, clicks, spend, and conversions per job title.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("jobTitle"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "jobTitle"],
    "defaultFields": ["account", "jobTitleName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_job_title",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_JOB_TITLE",
    "memberField": "jobTitle"
  },
  "adAnalyticsBySeniority": {
    "overview": "Ad Analytics by Seniority",
    "description": "Daily campaign performance by the seniority of the members who saw your ads — impressions, clicks, spend, and conversions per seniority level.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("seniority"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "seniority"],
    "defaultFields": ["account", "seniorityName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_seniority",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_SENIORITY",
    "memberField": "seniority"
  },
  "adAnalyticsByJobFunction": {
    "overview": "Ad Analytics by Job Function",
    "description": "Daily campaign performance by the job function of the members who saw your ads — impressions, clicks, spend, and conversions per job function.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("jobFunction"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "jobFunction"],
    "defaultFields": ["account", "jobFunctionName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_job_function",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_JOB_FUNCTION",
    "memberField": "jobFunction"
  },
  "adAnalyticsByIndustry": {
    "overview": "Ad Analytics by Industry",
    "description": "Daily campaign performance by the industry of the members who saw your ads — impressions, clicks, spend, and conversions per industry.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("industry"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "industry"],
    "defaultFields": ["account", "industryName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_industry",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_INDUSTRY",
    "memberField": "industry"
  },
  "adAnalyticsByCompanySize": {
    "overview": "Ad Analytics by Company Size",
    "description": "Daily campaign performance by the company size of the members who saw your ads — impressions, clicks, spend, and conversions per company size.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting",
    "fields": buildAdAnalyticsByMemberFields("companySize"),
    "uniqueKeys": ["dateRangeStart", "dateRangeEnd", "campaign", "companySize"],
    "defaultFields": ["account", "companySizeName", "impressions", "clicks", "costInLocalCurrency", "costInUsd", "landingPageClicks", "totalEngagements", "externalWebsiteConversions", "oneClickLeads"],
    "destinationName": "linkedin_ads_ad_analytics_by_company_size",
    "isTimeSeries": true,
    "memberPivot": "MEMBER_COMPANY_SIZE",
    "memberField": "companySize",
    // LinkedIn returns a band such as SIZE_201_TO_500, not a URN, so the band is its own name.
    "memberValueIsName": true
  }
}
