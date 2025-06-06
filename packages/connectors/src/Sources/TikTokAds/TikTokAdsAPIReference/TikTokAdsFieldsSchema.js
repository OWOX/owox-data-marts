/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var TikTokAdsFieldsSchema = {
  "advertiser": {
    "title": "Advertiser Account",
    "description": "TikTok Advertiser Account information",
    "documentation": "https://ads.tiktok.com/marketing_api/docs",
    "fields": advertiserFields,
    "uniqueKeys": ["advertiser_id"]
  },
  "campaigns": {
    "title": "Campaigns",
    "description": "TikTok Ad Campaigns",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1739318962329602",
    "fields": campaignsFields,
    "uniqueKeys": ["campaign_id"]
  },
  "ad_groups": {
    "title": "Ad Groups",
    "description": "TikTok Ad Groups",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1739314558673922",
    "fields": adGroupsFields,
    "uniqueKeys": ["adgroup_id"]
  },
  "ads": {
    "title": "Ads",
    "description": "TikTok Ads",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1735735588640770",
    "fields": adsFields,
    "uniqueKeys": ["ad_id"]
  },
  "ad_insights": {
    "title": "Ad Insights",
    "description": "TikTok Ad Insights Metrics",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1738864915188737",
    "fields": adInsightsFields,
    "uniqueKeys": ["ad_id", "stat_time_day"],
    "isTimeSeries": true
  },
  "audiences": {
    "title": "Audiences",
    "description": "TikTok Custom Audiences",
    "documentation": "https://ads.tiktok.com/marketing_api/docs?id=1739314536665090",
    "fields": audiencesFields,
    "uniqueKeys": ["audience_id"]
  }
};
