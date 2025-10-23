/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var keywordStatsFields = {
  'keyword_id': {
    'description': 'Keyword Criterion ID',
    'apiName': 'ad_group_criterion.criterion_id',
    'type': 'string'
  },
  'keyword_text': {
    'description': 'Keyword Text',
    'apiName': 'ad_group_criterion.keyword.text',
    'type': 'string'
  },
  'keyword_match_type': {
    'description': 'Keyword Match Type (EXACT, PHRASE, BROAD)',
    'apiName': 'ad_group_criterion.keyword.match_type',
    'type': 'string'
  },
  'keyword_status': {
    'description': 'Criterion Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'ad_group_criterion.status',
    'type': 'string'
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
  'quality_score': {
    'description': 'Quality Score',
    'apiName': 'ad_group_criterion.quality_info.quality_score',
    'type': 'number'
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
    'description': 'All Conversions (including cross-device, store visits, etc.)',
    'apiName': 'metrics.all_conversions',
    'type': 'number'
  },
  'all_conversions_value': {
    'description': 'All Conversions Value',
    'apiName': 'metrics.all_conversions_value',
    'type': 'number'
  },
  'average_cost': {
    'description': 'Average Cost Per Interaction',
    'apiName': 'metrics.average_cost',
    'type': 'number'
  },
  'average_cpm': {
    'description': 'Average CPM (Cost Per Thousand Impressions)',
    'apiName': 'metrics.average_cpm',
    'type': 'number'
  },
  'search_impression_share': {
    'description': 'Search Impression Share',
    'apiName': 'metrics.search_impression_share',
    'type': 'number'
  },
  'search_rank_lost_impression_share': {
    'description': 'Search Rank Lost Impression Share',
    'apiName': 'metrics.search_rank_lost_impression_share',
    'type': 'number'
  },
  'top_impression_percentage': {
    'description': 'Top Impression Percentage',
    'apiName': 'metrics.top_impression_percentage',
    'type': 'number'
  },
  'absolute_top_impression_percentage': {
    'description': 'Absolute Top Impression Percentage',
    'apiName': 'metrics.absolute_top_impression_percentage',
    'type': 'number'
  }
};


