/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adGroupsFields = {
  'adgroup_id': {
    'description': 'Ad Group ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'adgroup_name': {
    'description': 'Ad Group Name',
    'type': 'string'
  },
  'advertiser_id': {
    'description': 'Advertiser ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'type': 'string'
  },
  'operation_status': {
    'description': 'Operation Status',
    'type': 'string'
  },
  'budget': {
    'description': 'Ad Group Budget',
    'type': 'float'
  },
  'budget_mode': {
    'description': 'Budget Mode (BUDGET_MODE_DAY or BUDGET_MODE_TOTAL)',
    'type': 'string'
  },
  'bid_type': {
    'description': 'Bidding Type',
    'type': 'string'
  },
  'bid_price': {
    'description': 'Bid Price',
    'type': 'float'
  },
  'optimization_goal': {
    'description': 'Optimization Goal',
    'type': 'string'
  },
  'optimization_event': {
    'description': 'Optimization Event',
    'type': 'string'
  },
  'app_id': {
    'description': 'ID of the app being promoted',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'app_type': {
    'description': 'Type of app',
    'type': 'string'
  },
  'audience_type': {
    'description': 'Type of audience',
    'type': 'string'
  },
  'audience_ids': {
    'description': 'List of audience IDs',
    'type': 'array'
  },
  'excluded_audience_ids': {
    'description': 'List of excluded audience IDs',
    'type': 'array'
  },
  'gender': {
    'description': 'Target gender',
    'type': 'string'
  },
  'age_groups': {
    'description': 'Target age groups',
    'type': 'array'
  },
  'languages': {
    'description': 'Target languages',
    'type': 'array'
  },
  'location_ids': {
    'description': 'Target location IDs',
    'type': 'array'
  },
  'interest_category_ids': {
    'description': 'Interest category IDs',
    'type': 'array'
  },
  'placements': {
    'description': 'Ad placements',
    'type': 'array'
  },
  'placement_type': {
    'description': 'Type of placement',
    'type': 'string'
  },
  'schedule_start_time': {
    'description': 'Schedule Start Time',
    'type': 'datetime'
  },
  'schedule_end_time': {
    'description': 'Schedule End Time',
    'type': 'datetime'
  },
  'schedule_type': {
    'description': 'Type of schedule',
    'type': 'string'
  },
  'frequency': {
    'description': 'Frequency cap',
    'type': 'integer'
  },
  'billing_event': {
    'description': 'Billing Event Type',
    'type': 'string'
  },
  'conversion_id': {
    'description': 'Conversion ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'conversion_bid_price': {
    'description': 'Conversion Bid Price',
    'type': 'float'
  },
  'conversion_window': {
    'description': 'Conversion Window',
    'type': 'integer'
  },
  'click_attribution_window': {
    'description': 'Click Attribution Window',
    'type': 'integer'
  },
  'view_attribution_window': {
    'description': 'View Attribution Window',
    'type': 'integer'
  },
  'is_smart_performance_campaign': {
    'description': 'Flag indicating if the ad group uses smart performance optimization',
    'type': 'bool'
  },
  'is_new_structure': {
    'description': 'Flag indicating if the ad group utilizes a new structure',
    'type': 'bool'
  },
  'auto_targeting_enabled': {
    'description': 'Flag indicating if auto targeting is enabled',
    'type': 'bool'
  },
  'targeting_expansion': {
    'description': 'Targeting expansion settings',
    'type': 'object'
  },
  'device_price_ranges': {
    'description': 'Target device price ranges',
    'type': 'array'
  },
  'device_model_ids': {
    'description': 'Target device model IDs',
    'type': 'array'
  },
  'operating_systems': {
    'description': 'Target operating systems',
    'type': 'array'
  },
  'network_types': {
    'description': 'Target network types',
    'type': 'array'
  },
  'carrier_ids': {
    'description': 'Target carrier IDs',
    'type': 'array'
  },
  'create_time': {
    'description': 'Creation Time',
    'type': 'datetime'
  },
  'modify_time': {
    'description': 'Last Modified Time',
    'type': 'datetime'
  }
};
