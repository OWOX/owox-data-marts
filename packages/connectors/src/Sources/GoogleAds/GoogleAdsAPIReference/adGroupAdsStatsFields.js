/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adGroupAdStatsFields = {
  'ad_id': {
    'description': 'Ad ID',
    'apiName': 'ad_group_ad.ad.id',
    'type': DATA_TYPES.STRING
  },
  'ad_status': {
    'description': 'Ad Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'ad_group_ad.status',
    'type': DATA_TYPES.STRING
  },
  'ad_final_urls': {
    'description': 'Final URLs for the Ad',
    'apiName': 'ad_group_ad.ad.final_urls',
    'type': DATA_TYPES.ARRAY
  },
  'ad_group_id': {
    'description': 'Ad Group ID',
    'apiName': 'ad_group.id',
    'type': DATA_TYPES.STRING
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'apiName': 'campaign.id',
    'type': DATA_TYPES.STRING
  },
  'date': {
    'description': 'Date for time series data',
    'apiName': 'segments.date',
    'type': DATA_TYPES.STRING
  },
  'impressions': {
    'description': 'Number of Impressions',
    'apiName': 'metrics.impressions',
    'type': DATA_TYPES.NUMBER
  },
  'clicks': {
    'description': 'Number of Clicks',
    'apiName': 'metrics.clicks',
    'type': DATA_TYPES.NUMBER
  },
  'cost_micros': {
    'description': 'Cost in Micros',
    'apiName': 'metrics.cost_micros',
    'type': DATA_TYPES.NUMBER
  },
  'conversions': {
    'description': 'Number of Conversions',
    'apiName': 'metrics.conversions',
    'type': DATA_TYPES.NUMBER
  },
  'ctr': {
    'description': 'Click-Through Rate',
    'apiName': 'metrics.ctr',
    'type': DATA_TYPES.NUMBER
  },
  'average_cpc': {
    'description': 'Average Cost Per Click',
    'apiName': 'metrics.average_cpc',
    'type': DATA_TYPES.NUMBER
  },
  'conversions_value': {
    'description': 'Total Conversion Value',
    'apiName': 'metrics.conversions_value',
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_conversion': {
    'description': 'Cost Per Conversion',
    'apiName': 'metrics.cost_per_conversion',
    'type': DATA_TYPES.NUMBER
  },
  'ad_type': {
    'description': 'Ad Type (TEXT_AD, EXPANDED_TEXT_AD, RESPONSIVE_SEARCH_AD, etc.)',
    'apiName': 'ad_group_ad.ad.type',
    'type': DATA_TYPES.STRING
  },
  'ad_name': {
    'description': 'Ad Name',
    'apiName': 'ad_group_ad.ad.name',
    'type': DATA_TYPES.STRING
  },
  'ad_group_name': {
    'description': 'Ad Group Name',
    'apiName': 'ad_group.name',
    'type': DATA_TYPES.STRING
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'apiName': 'campaign.name',
    'type': DATA_TYPES.STRING
  },
  'conversion_rate': {
    'description': 'Conversion Rate',
    'apiName': 'metrics.conversions_from_interactions_rate',
    'type': DATA_TYPES.NUMBER
  },
  'view_through_conversions': {
    'description': 'View-Through Conversions',
    'apiName': 'metrics.view_through_conversions',
    'type': DATA_TYPES.NUMBER
  },
  'all_conversions': {
    'description': 'All Conversions',
    'apiName': 'metrics.all_conversions',
    'type': DATA_TYPES.NUMBER
  },
  'all_conversions_value': {
    'description': 'All Conversions Value',
    'apiName': 'metrics.all_conversions_value',
    'type': DATA_TYPES.NUMBER
  },
  'average_cost': {
    'description': 'Average Cost',
    'apiName': 'metrics.average_cost',
    'type': DATA_TYPES.NUMBER
  },
  'average_cpm': {
    'description': 'Average CPM',
    'apiName': 'metrics.average_cpm',
    'type': DATA_TYPES.NUMBER
  },
  'interactions': {
    'description': 'Number of Interactions',
    'apiName': 'metrics.interactions',
    'type': DATA_TYPES.NUMBER
  },
  'interaction_rate': {
    'description': 'Interaction Rate',
    'apiName': 'metrics.interaction_rate',
    'type': DATA_TYPES.NUMBER
  }
};


