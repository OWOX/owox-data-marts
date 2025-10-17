/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const GoogleAdsFieldsSchema = {
  campaigns: {
    overview: "Google Ads Campaigns",
    description: "Campaign structure and settings (no metrics)",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/campaign",
    fields: campaignFields,
    uniqueKeys: ['campaign_id'],
    destinationName: 'google_ads_campaigns',
    isTimeSeries: false
  },
  campaigns_stats: {
    overview: "Google Ads Campaigns Stats",
    description: "Campaign daily performance metrics",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/campaign",
    fields: campaignStatsFields,
    uniqueKeys: ['campaign_id', 'date'],
    destinationName: 'google_ads_campaigns_stats',
    isTimeSeries: true
  },
  ad_groups: {
    overview: "Google Ads Ad Groups", 
    description: "Ad group structure and settings (no metrics)",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group",
    fields: adGroupFields,
    uniqueKeys: ['ad_group_id'],
    destinationName: 'google_ads_ad_groups',
    isTimeSeries: false
  },
  ad_groups_stats: {
    overview: "Google Ads Ad Groups Stats",
    description: "Ad group daily performance metrics", 
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group",
    fields: adGroupStatsFields,
    uniqueKeys: ['ad_group_id', 'date'],
    destinationName: 'google_ads_ad_groups_stats',
    isTimeSeries: true
  },
  ad_group_ads_stats: {
    overview: "Google Ads Ad Group Ads Stats",
    description: "Ad group ad daily performance metrics",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group_ad",
    fields: adGroupAdStatsFields,
    uniqueKeys: ['ad_id', 'date'],
    destinationName: 'google_ads_ad_group_ads_stats',
    isTimeSeries: true
  },
  keywords_stats: {
    overview: "Google Ads Keywords Stats",
    description: "Keyword daily performance metrics",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/keyword_view",
    fields: keywordStatsFields,
    uniqueKeys: ['keyword_id', 'date'],
    destinationName: 'google_ads_keywords_stats',
    isTimeSeries: true
  },
  criterion: {
    overview: "Google Ads Criterion",
    description: "Ad group criterion (keywords, placements, etc.) structure and settings",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group_criterion",
    fields: criterionFields,
    uniqueKeys: ['criterion_id', 'ad_group_id', 'campaign_id'],
    destinationName: 'google_ads_criterion',
    isTimeSeries: false
  }
};
