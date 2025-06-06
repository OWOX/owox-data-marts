/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignsFields = {
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
  'app_promotion_type': {
    'description': 'Type of app promotion being used in the campaign',
    'type': 'string'
  },
  'operation_status': {
    'description': 'Operation Status',
    'type': 'string'
  },
  'bid_type': {
    'description': 'Type of bid strategy being used in the campaign',
    'type': 'string'
  },
  'roas_bid': {
    'description': 'Return on ad spend bid target',
    'type': 'float'
  },
  'is_advanced_dedicated_campaign': {
    'description': 'Flag indicating if this is an advanced dedicated campaign',
    'type': 'bool'
  },
  'is_search_campaign': {
    'description': 'Flag indicating if the campaign is for search ads',
    'type': 'bool'
  },
  'rf_campaign_type': {
    'description': 'Reach and frequency campaign type',
    'type': 'string'
  },
  'rta_bid_enabled': {
    'description': 'Flag indicating if RTA bidding is enabled',
    'type': 'bool'
  },
  'secondary_status': {
    'description': 'Additional status information of the campaign',
    'type': 'string'
  },
  'postback_window_mode': {
    'description': 'Mode for the postback window',
    'type': 'string'
  },
  'disable_skan_campaign': {
    'description': 'Flag indicating if SKAdNetwork is disabled for the campaign',
    'type': 'bool'
  },
  'budget_optimize_on': {
    'description': 'The metric or event that the budget optimization is based on',
    'type': 'bool'
  },
  'budget_mode': {
    'description': 'Budget Mode (BUDGET_MODE_DAY or BUDGET_MODE_TOTAL)',
    'type': 'string'
  },
  'objective': {
    'description': 'Campaign Objective',
    'type': 'string'
  },
  'campaign_product_source': {
    'description': 'Source of products for the campaign',
    'type': 'string'
  },
  'optimization_goal': {
    'description': 'Specific goal to be optimized for in the campaign',
    'type': 'string'
  },
  'special_industries': {
    'description': 'Special industries classification for the campaign',
    'type': 'string'
  },
  'deep_bid_type': {
    'description': 'Type of deep bidding strategy',
    'type': 'string'
  },
  'rta_id': {
    'description': 'Real-time advertising ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'rta_product_selection_enabled': {
    'description': 'Flag indicating if RTA product selection is enabled',
    'type': 'bool'
  },
  'budget': {
    'description': 'Campaign Budget',
    'type': 'float'
  },
  'is_new_structure': {
    'description': 'Flag indicating if the campaign utilizes a new campaign structure',
    'type': 'bool'
  },
  'is_smart_performance_campaign': {
    'description': 'Flag indicating if the campaign uses smart performance optimization',
    'type': 'bool'
  },
  'modify_time': {
    'description': 'Last Modified Time',
    'type': 'datetime'
  },
  'app_id': {
    'description': 'ID of the app being promoted',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'objective_type': {
    'description': 'Type of objective selected for the campaign (e.g., brand awareness, app installs)',
    'type': 'string'
  },
  'campaign_type': {
    'description': 'Type of campaign (e.g., awareness, conversion)',
    'type': 'string'
  },
  'campaign_app_profile_page_state': {
    'description': 'App profile page state for app campaigns',
    'type': 'string'
  },
  'create_time': {
    'description': 'Creation Time',
    'type': 'datetime'
  },
  'catalog_enabled': {
    'description': 'Flag indicating if product catalog is enabled',
    'type': 'bool'
  },
  'bid_align_type': {
    'description': 'Type of bid alignment',
    'type': 'string'
  }
};
