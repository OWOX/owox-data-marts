/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const GoogleAdsFieldsSchema = {
  campaign_catalog: {
    overview: "Google Ads Campaign Catalog",
    description: "Campaign structure and settings (no metrics)",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/campaign",
    fields: campaignCatalogFields,
    uniqueKeys: ['campaign_id'],
    destinationName: 'google_ads_campaign_catalog',
    isTimeSeries: false
  },
  campaign_stats: {
    overview: "Google Ads Campaign Stats",
    description: "Campaign daily performance metrics",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/campaign",
    fields: campaignStatsFields,
    uniqueKeys: ['campaign_id', 'date'],
    destinationName: 'google_ads_campaign_stats',
    isTimeSeries: true
  },
  ad_group_catalog: {
    overview: "Google Ads Ad Group Catalog", 
    description: "Ad group structure and settings (no metrics)",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group",
    fields: adGroupCatalogFields,
    uniqueKeys: ['ad_group_id'],
    destinationName: 'google_ads_ad_group_catalog',
    isTimeSeries: false
  },
  ad_group_stats: {
    overview: "Google Ads Ad Group Stats",
    description: "Ad group daily performance metrics", 
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group",
    fields: adGroupStatsFields,
    uniqueKeys: ['ad_group_id', 'date'],
    destinationName: 'google_ads_ad_group_stats',
    isTimeSeries: true
  },
  ad_group_ad_stats: {
    overview: "Google Ads Ad Group Ad Stats",
    description: "Ad group ad daily performance metrics",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group_ad",
    fields: adGroupAdFields,
    uniqueKeys: ['ad_id', 'date'],
    destinationName: 'google_ads_ad_group_ad_stats',
    isTimeSeries: true
  },
  keyword_stats: {
    overview: "Google Ads Keyword Stats",
    description: "Keyword daily performance metrics",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/keyword_view",
    fields: keywordFields,
    uniqueKeys: ['keyword_id', 'date'],
    destinationName: 'google_ads_keyword_stats',
    isTimeSeries: true
  },
  criterion_catalog: {
    overview: "Google Ads Criterion Catalog",
    description: "Ad group criterion (keywords, placements, etc.) structure and settings",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group_criterion",
    fields: criterionFields,
    uniqueKeys: ['criterion_id'],
    destinationName: 'google_ads_criterion_catalog',
    isTimeSeries: false
  }
};
