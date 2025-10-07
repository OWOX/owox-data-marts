/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignStatsFields = {
  'campaign_id': {
    'description': 'Campaign ID',
    'apiName': 'campaign.id',
    'type': 'string'
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'apiName': 'campaign.name',
    'type': 'string'
  },
  'campaign_status': {
    'description': 'Campaign Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'campaign.status',
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
  }
};

