/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const GoogleAdsFieldsSchema = {
  campaigns: {
    overview: "Google Ads Campaigns",
    description: "Your campaign settings — channel type, bidding strategy, budget, and scheduling.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/campaign",
    fields: campaignFields,
    uniqueKeys: ['campaign_id'],
    defaultFields: ['campaign_id', 'campaign_name', 'campaign_status', 'campaign_advertising_channel_type', 'campaign_start_date', 'campaign_end_date', 'campaign_bidding_strategy_type', 'campaign_budget_amount_micros'],
    destinationName: 'google_ads_campaigns',
    isTimeSeries: false
  },
  campaigns_stats: {
    overview: "Google Ads Campaigns Stats",
    description: "Daily campaign performance — impressions, clicks, cost, and conversions.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/campaign",
    fields: campaignStatsFields,
    uniqueKeys: ['campaign_id', 'date'],
    defaultFields: ['campaign_id', 'campaign_name', 'date', 'impressions', 'clicks', 'cost_micros', 'conversions', 'conversions_value', 'ctr', 'average_cpc', 'cost_per_conversion'],
    destinationName: 'google_ads_campaigns_stats',
    isTimeSeries: true
  },
  ad_groups: {
    overview: "Google Ads Ad Groups",
    description: "Your ad group settings — type, status, and bid configuration within each campaign.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group",
    fields: adGroupFields,
    uniqueKeys: ['ad_group_id'],
    defaultFields: ['ad_group_id', 'ad_group_name', 'ad_group_status', 'ad_group_type', 'campaign_id', 'campaign_name'],
    destinationName: 'google_ads_ad_groups',
    isTimeSeries: false
  },
  ad_groups_stats: {
    overview: "Google Ads Ad Groups Stats",
    description: "Daily ad group performance — impressions, clicks, cost, and conversions.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group",
    fields: adGroupStatsFields,
    uniqueKeys: ['ad_group_id', 'date'],
    defaultFields: ['ad_group_id', 'ad_group_name', 'campaign_id', 'date', 'impressions', 'clicks', 'cost_micros', 'conversions', 'conversions_value', 'ctr', 'average_cpc', 'cost_per_conversion'],
    destinationName: 'google_ads_ad_groups_stats',
    isTimeSeries: true
  },
  ad_group_ads_stats: {
    overview: "Google Ads Ad Group Ads Stats",
    description: "Daily performance for individual ads — impressions, clicks, cost, and conversions.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group_ad",
    fields: adGroupAdStatsFields,
    uniqueKeys: ['ad_id', 'date'],
    defaultFields: ['ad_id', 'ad_name', 'ad_type', 'ad_status', 'ad_group_id', 'ad_group_name', 'campaign_id', 'campaign_name', 'date', 'impressions', 'clicks', 'cost_micros', 'conversions', 'conversions_value', 'ctr', 'average_cpc', 'cost_per_conversion'],
    destinationName: 'google_ads_ad_group_ads_stats',
    isTimeSeries: true
  },
  keywords_stats: {
    overview: "Google Ads Keywords Stats",
    description: "Daily keyword performance — impressions, clicks, cost, conversions, and quality score.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/keyword_view",
    fields: keywordStatsFields,
    uniqueKeys: ['keyword_id', 'date'],
    defaultFields: ['keyword_id', 'keyword_text', 'keyword_match_type', 'keyword_status', 'ad_group_id', 'campaign_id', 'date', 'impressions', 'clicks', 'cost_micros', 'conversions', 'conversions_value', 'ctr', 'average_cpc', 'cost_per_conversion', 'quality_score'],
    destinationName: 'google_ads_keywords_stats',
    isTimeSeries: true
  },
  criterion: {
    overview: "Google Ads Criterion",
    description: "Ad group targeting criteria — keywords, placements, and negative exclusions with bid settings.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/ad_group_criterion",
    fields: criterionFields,
    uniqueKeys: ['criterion_id', 'ad_group_id', 'campaign_id'],
    defaultFields: ['criterion_id', 'criterion_type', 'criterion_status', 'keyword_text', 'keyword_match_type', 'ad_group_id', 'ad_group_name', 'campaign_id', 'campaign_name', 'negative', 'quality_score'],
    destinationName: 'google_ads_criterion',
    isTimeSeries: false
  },
  geo_stats: {
    overview: "Google Ads Geo Stats",
    description: "Daily performance by country and targeting type — impressions, clicks, cost, and conversions.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/geographic_view",
    fields: geoTargetFields,
    uniqueKeys: ['campaign_id', 'country_criterion_id', 'location_type', 'date'],
    defaultFields: ['campaign_id', 'country_criterion_id', 'location_type', 'date',
    'impressions', 'clicks', 'cost_micros', 'conversions'],
    destinationName: 'google_ads_geo_stats',
    isTimeSeries: true
  },
  geo_target_constants: {
    overview: "Google Ads Geo Target Constants",
    description: "Reference table of geographic targets — join with geo_stats on country_criterion_id to resolve country names.",
    documentation: "https://developers.google.com/google-ads/api/fields/v21/geo_target_constant",
    fields: geoTargetConstantFields,
    uniqueKeys: ['geo_target_constant_id'],
    defaultFields: ['geo_target_constant_id', 'name', 'country_code', 'canonical_name'],
    destinationName: 'google_ads_geo_target_constants',
    whereClause: "geo_target_constant.target_type = 'Country'",
    isGlobalResource: true,
    isTimeSeries: false
  }
};
