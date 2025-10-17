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
    'type': 'string'
  },
  'ad_status': {
    'description': 'Ad Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'ad_group_ad.status',
    'type': 'string'
  },
  'ad_final_urls': {
    'description': 'Final URLs for the Ad',
    'apiName': 'ad_group_ad.ad.final_urls',
    'type': 'array'
  },
  'ad_group_id': {
    'description': 'Ad Group ID',
    'apiName': 'ad_group.id',
    'type': 'string'
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'apiName': 'campaign.id',
    'type': 'string'
  },
  'date': {
    'description': 'Date for time series data',
    'apiName': 'segments.date',
    'type': 'string'
  },
  'impressions': {
    'description': 'Number of Impressions',
    'apiName': 'metrics.impressions',
    'type': 'number'
  },
  'clicks': {
    'description': 'Number of Clicks',
    'apiName': 'metrics.clicks',
    'type': 'number'
  },
  'cost_micros': {
    'description': 'Cost in Micros',
    'apiName': 'metrics.cost_micros',
    'type': 'number'
  },
  'conversions': {
    'description': 'Number of Conversions',
    'apiName': 'metrics.conversions',
    'type': 'number'
  },
  'ctr': {
    'description': 'Click-Through Rate',
    'apiName': 'metrics.ctr',
    'type': 'number'
  },
  'average_cpc': {
    'description': 'Average Cost Per Click',
    'apiName': 'metrics.average_cpc',
    'type': 'number'
  },
  'conversions_value': {
    'description': 'Total Conversion Value',
    'apiName': 'metrics.conversions_value',
    'type': 'number'
  },
  'cost_per_conversion': {
    'description': 'Cost Per Conversion',
    'apiName': 'metrics.cost_per_conversion',
    'type': 'number'
  },
  'ad_type': {
    'description': 'Ad Type (TEXT_AD, EXPANDED_TEXT_AD, RESPONSIVE_SEARCH_AD, etc.)',
    'apiName': 'ad_group_ad.ad.type',
    'type': 'string'
  },
  'ad_name': {
    'description': 'Ad Name',
    'apiName': 'ad_group_ad.ad.name',
    'type': 'string'
  },
  'ad_group_name': {
    'description': 'Ad Group Name',
    'apiName': 'ad_group.name',
    'type': 'string'
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'apiName': 'campaign.name',
    'type': 'string'
  },
  'conversion_rate': {
    'description': 'Conversion Rate',
    'apiName': 'metrics.conversions_from_interactions_rate',
    'type': 'number'
  },
  'view_through_conversions': {
    'description': 'View-Through Conversions',
    'apiName': 'metrics.view_through_conversions',
    'type': 'number'
  },
  'all_conversions': {
    'description': 'All Conversions',
    'apiName': 'metrics.all_conversions',
    'type': 'number'
  },
  'all_conversions_value': {
    'description': 'All Conversions Value',
    'apiName': 'metrics.all_conversions_value',
    'type': 'number'
  },
  'average_cost': {
    'description': 'Average Cost',
    'apiName': 'metrics.average_cost',
    'type': 'number'
  },
  'average_cpm': {
    'description': 'Average CPM',
    'apiName': 'metrics.average_cpm',
    'type': 'number'
  },
  'interactions': {
    'description': 'Number of Interactions',
    'apiName': 'metrics.interactions',
    'type': 'number'
  },
  'interaction_rate': {
    'description': 'Interaction Rate',
    'apiName': 'metrics.interaction_rate',
    'type': 'number'
  }
};


