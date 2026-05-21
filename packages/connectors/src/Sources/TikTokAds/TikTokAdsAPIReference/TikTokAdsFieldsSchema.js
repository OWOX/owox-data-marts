/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var TikTokAdsFieldsSchema = {
  "advertiser": {
    "title": "Advertiser Account",
    "description": "Advertiser account — name, company, and currency.",
    "documentation": "https://ads.tiktok.com/marketing_api/docs",
    "fields": advertiserFields,
    "uniqueKeys": ["advertiser_id"],
    "defaultFields": ["advertiser_id", "advertiser_name", "company_name", "currency"],
    "destinationName": "tiktok_ads_advertiser"
  },
  "campaigns": {
    "title": "Campaigns",
    "description": "Your campaigns — objective, type, status, budget, and schedule.",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1739318962329602",
    "fields": campaignsFields,
    "uniqueKeys": ["campaign_id"],
    "defaultFields": ["campaign_id", "campaign_name", "advertiser_id", "objective_type", "campaign_type", "operation_status", "secondary_status", "budget_mode", "budget", "create_time", "modify_time"],
    "destinationName": "tiktok_ads_campaigns"
  },
  "ad_groups": {
    "title": "Ad Groups",
    "description": "Ad groups within your campaigns — bid strategy, optimization goal, placement, and targeting schedule.",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1739314558673922",
    "fields": adGroupsFields,
    "uniqueKeys": ["adgroup_id"],
    "defaultFields": ["adgroup_id", "adgroup_name", "advertiser_id", "campaign_id", "campaign_name", "operation_status", "budget_mode", "budget", "bid_type", "optimization_goal", "placement_type", "schedule_start_time", "schedule_end_time", "create_time", "modify_time"],
    "destinationName": "tiktok_ads_ad_groups"
  },
  "ads": {
    "title": "Ads",
    "description": "Individual ads — creative type, format, call to action, status, and links to their campaigns and ad groups.",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1735735588640770",
    "fields": adsFields,
    "uniqueKeys": ["ad_id"],
    "defaultFields": ["ad_id", "ad_name", "advertiser_id", "campaign_id", "campaign_name", "adgroup_id", "adgroup_name", "operation_status", "secondary_status", "creative_type", "ad_format", "call_to_action", "create_time", "modify_time"],
    "destinationName": "tiktok_ads_ads"
  },
  "ad_insights": {
    "title": "Ad Performance",
    "description": "Daily ad performance — impressions, clicks, spend, conversions, video views, and engagement.",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1738864915188737",
    "fields": adInsightsFields,
    "uniqueKeys": ["ad_id", "stat_time_day"],
    "defaultFields": ["ad_id", "stat_time_day", "advertiser_id", "campaign_id", "adgroup_id", "impressions", "clicks", "spend", "ctr", "cpc", "cpm", "reach", "conversion", "cost_per_conversion", "video_views", "video_completion"],
    "destinationName": "tiktok_ads_ad_insights",
    "isTimeSeries": true
  },
  "ad_insights_by_country": {
    "title": "Ad Performance by Country",
    "description": "Daily ad performance broken down by country — impressions, clicks, spend, conversions, and video views.",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1738864915188737",
    "fields": adInsightsByCountryFields,
    "uniqueKeys": ["ad_id", "stat_time_day", "country_code"],
    "defaultFields": ["ad_id", "stat_time_day", "country_code", "advertiser_id", "campaign_id", "adgroup_id", "impressions", "clicks", "spend", "ctr", "cpc", "cpm", "reach", "conversion", "cost_per_conversion", "video_views", "video_completion"],
    "destinationName": "tiktok_ads_ad_insights_by_country",
    "isTimeSeries": true
  },
  "audiences": {
    "title": "Custom Audiences",
    "description": "Custom audiences — type, size, validity status, and expiration.",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1739314536665090",
    "fields": audiencesFields,
    "uniqueKeys": ["audience_id"],
    "defaultFields": ["audience_id", "advertiser_id", "name", "audience_type", "cover_num", "is_valid", "is_expiring", "create_time"],
    "destinationName": "tiktok_ads_audiences"
  }
};
