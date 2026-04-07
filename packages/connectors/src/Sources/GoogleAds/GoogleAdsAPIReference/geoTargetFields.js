/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var geoTargetFields = {
  'country_criterion_id': {
    'description': 'Criterion ID for the country (maps to geo_target_constant_id in geo_target_constants table)',
    'apiName': 'geographic_view.country_criterion_id',
    'type': DATA_TYPES.STRING
  },
  'location_type': {
    'description': 'Geo targeting type: AREA_OF_INTEREST (user searched for this location) or LOCATION_OF_PRESENCE (user was physically in this location)',
    'apiName': 'geographic_view.location_type',
    'type': DATA_TYPES.STRING
  },
  'date': {
    'description': 'Date for time series data',
    'apiName': 'segments.date',
    'type': DATA_TYPES.STRING
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'apiName': 'campaign.id',
    'type': DATA_TYPES.STRING
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'apiName': 'campaign.name',
    'type': DATA_TYPES.STRING
  },
  'campaign_status': {
    'description': 'Campaign Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'campaign.status',
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
  'conversions_value': {
    'description': 'Total Conversion Value',
    'apiName': 'metrics.conversions_value',
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
  'all_conversions': {
    'description': 'All Conversions (includes cross-device and view-through)',
    'apiName': 'metrics.all_conversions',
    'type': DATA_TYPES.NUMBER
  },
  'all_conversions_value': {
    'description': 'All Conversions Value',
    'apiName': 'metrics.all_conversions_value',
    'type': DATA_TYPES.NUMBER
  },
  'view_through_conversions': {
    'description': 'View-Through Conversions',
    'apiName': 'metrics.view_through_conversions',
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_conversion': {
    'description': 'Cost Per Conversion',
    'apiName': 'metrics.cost_per_conversion',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_rate': {
    'description': 'Conversion Rate',
    'apiName': 'metrics.conversions_from_interactions_rate',
    'type': DATA_TYPES.NUMBER
  }
};
