/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var keywordFields = {
  'keyword_id': {
    'description': 'Keyword Criterion ID',
    'apiName': 'keyword_view.resource_name',
    'type': 'string'
  },
  'keyword_text': {
    'description': 'Keyword Text',
    'apiName': 'keyword_view.criterion_id',
    'type': 'string'
  },
  'keyword_match_type': {
    'description': 'Keyword Match Type (EXACT, PHRASE, BROAD)',
    'apiName': 'keyword_view.match_type',
    'type': 'string'
  },
  'keyword_status': {
    'description': 'Criterion Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'keyword_view.status',
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
  }
};

