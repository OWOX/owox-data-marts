/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adGroupsFields = {
  'adgroup_id': {
    'description': 'Ad Group ID',
    'type': DATA_TYPES.STRING,
  },
  'adgroup_name': {
    'description': 'Ad Group Name',
    'type': DATA_TYPES.STRING
  },
  'advertiser_id': {
    'description': 'Advertiser ID',
    'type': DATA_TYPES.STRING,
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'type': DATA_TYPES.STRING,
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'type': DATA_TYPES.STRING
  },
  'operation_status': {
    'description': 'Operation Status',
    'type': DATA_TYPES.STRING
  },
  'budget': {
    'description': 'Ad Group Budget',
    'type': DATA_TYPES.NUMBER
  },
  'budget_mode': {
    'description': 'Budget Mode (BUDGET_MODE_DAY or BUDGET_MODE_TOTAL)',
    'type': DATA_TYPES.STRING
  },
  'bid_type': {
    'description': 'Bidding Type',
    'type': DATA_TYPES.STRING
  },
  'bid_price': {
    'description': 'Bid Price',
    'type': DATA_TYPES.NUMBER
  },
  'optimization_goal': {
    'description': 'Optimization Goal',
    'type': DATA_TYPES.STRING
  },
  'optimization_event': {
    'description': 'Optimization Event',
    'type': DATA_TYPES.STRING
  },
  'app_id': {
    'description': 'ID of the app being promoted',
    'type': DATA_TYPES.STRING,
  },
  'app_type': {
    'description': 'Type of app',
    'type': DATA_TYPES.STRING
  },
  'audience_type': {
    'description': 'Type of audience',
    'type': DATA_TYPES.STRING
  },
  'audience_ids': {
    'description': 'List of audience IDs',
    'type': DATA_TYPES.ARRAY
  },
  'excluded_audience_ids': {
    'description': 'List of excluded audience IDs',
    'type': DATA_TYPES.ARRAY
  },
  'gender': {
    'description': 'Target gender',
    'type': DATA_TYPES.STRING
  },
  'age_groups': {
    'description': 'Target age groups',
    'type': DATA_TYPES.ARRAY
  },
  'languages': {
    'description': 'Target languages',
    'type': DATA_TYPES.ARRAY
  },
  'location_ids': {
    'description': 'Target location IDs',
    'type': DATA_TYPES.ARRAY
  },
  'interest_category_ids': {
    'description': 'Interest category IDs',
    'type': DATA_TYPES.ARRAY
  },
  'placements': {
    'description': 'Ad placements',
    'type': DATA_TYPES.ARRAY
  },
  'placement_type': {
    'description': 'Type of placement',
    'type': DATA_TYPES.STRING
  },
  'schedule_start_time': {
    'description': 'Schedule Start Time',
    'type': DATA_TYPES.DATETIME
  },
  'schedule_end_time': {
    'description': 'Schedule End Time',
    'type': DATA_TYPES.DATETIME
  },
  'schedule_type': {
    'description': 'Type of schedule',
    'type': DATA_TYPES.STRING
  },
  'frequency': {
    'description': 'Frequency cap',
    'type': DATA_TYPES.INTEGER
  },
  'billing_event': {
    'description': 'Billing Event Type',
    'type': DATA_TYPES.STRING
  },
  'conversion_id': {
    'description': 'Conversion ID',
    'type': DATA_TYPES.STRING,
  },
  'conversion_bid_price': {
    'description': 'Conversion Bid Price',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_window': {
    'description': 'Conversion Window',
    'type': DATA_TYPES.INTEGER
  },
  'click_attribution_window': {
    'description': 'Click Attribution Window',
    'type': DATA_TYPES.INTEGER
  },
  'view_attribution_window': {
    'description': 'View Attribution Window',
    'type': DATA_TYPES.INTEGER
  },
  'is_smart_performance_campaign': {
    'description': 'Flag indicating if the ad group uses smart performance optimization',
    'type': DATA_TYPES.BOOLEAN
  },
  'is_new_structure': {
    'description': 'Flag indicating if the ad group utilizes a new structure',
    'type': DATA_TYPES.BOOLEAN
  },
  'auto_targeting_enabled': {
    'description': 'Flag indicating if auto targeting is enabled',
    'type': DATA_TYPES.BOOLEAN
  },
  'targeting_expansion': {
    'description': 'Targeting expansion settings',
    'type': DATA_TYPES.OBJECT
  },
  'device_price_ranges': {
    'description': 'Target device price ranges',
    'type': DATA_TYPES.ARRAY
  },
  'device_model_ids': {
    'description': 'Target device model IDs',
    'type': DATA_TYPES.ARRAY
  },
  'operating_systems': {
    'description': 'Target operating systems',
    'type': DATA_TYPES.ARRAY
  },
  'network_types': {
    'description': 'Target network types',
    'type': DATA_TYPES.ARRAY
  },
  'carrier_ids': {
    'description': 'Target carrier IDs',
    'type': DATA_TYPES.ARRAY
  },
  'create_time': {
    'description': 'Creation Time',
    'type': DATA_TYPES.DATETIME
  },
  'modify_time': {
    'description': 'Last Modified Time',
    'type': DATA_TYPES.DATETIME
  }
};
