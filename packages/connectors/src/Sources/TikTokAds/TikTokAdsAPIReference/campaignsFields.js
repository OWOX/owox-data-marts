/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignsFields = {
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
  'app_promotion_type': {
    'description': 'Type of app promotion being used in the campaign',
    'type': DATA_TYPES.STRING
  },
  'operation_status': {
    'description': 'Operation Status',
    'type': DATA_TYPES.STRING
  },
  'bid_type': {
    'description': 'Type of bid strategy being used in the campaign',
    'type': DATA_TYPES.STRING
  },
  'roas_bid': {
    'description': 'Return on ad spend bid target',
    'type': DATA_TYPES.NUMBER
  },
  'is_advanced_dedicated_campaign': {
    'description': 'Flag indicating if this is an advanced dedicated campaign',
    'type': DATA_TYPES.BOOLEAN
  },
  'is_search_campaign': {
    'description': 'Flag indicating if the campaign is for search ads',
    'type': DATA_TYPES.BOOLEAN
  },
  'rf_campaign_type': {
    'description': 'Reach and frequency campaign type',
    'type': DATA_TYPES.STRING
  },
  'rta_bid_enabled': {
    'description': 'Flag indicating if RTA bidding is enabled',
    'type': DATA_TYPES.BOOLEAN
  },
  'secondary_status': {
    'description': 'Additional status information of the campaign',
    'type': DATA_TYPES.STRING
  },
  'postback_window_mode': {
    'description': 'Mode for the postback window',
    'type': DATA_TYPES.STRING
  },
  'disable_skan_campaign': {
    'description': 'Flag indicating if SKAdNetwork is disabled for the campaign',
    'type': DATA_TYPES.BOOLEAN
  },
  'budget_optimize_on': {
    'description': 'The metric or event that the budget optimization is based on',
    'type': DATA_TYPES.BOOLEAN
  },
  'budget_mode': {
    'description': 'Budget Mode (BUDGET_MODE_DAY or BUDGET_MODE_TOTAL)',
    'type': DATA_TYPES.STRING
  },
  'objective': {
    'description': 'Campaign Objective',
    'type': DATA_TYPES.STRING
  },
  'campaign_product_source': {
    'description': 'Source of products for the campaign',
    'type': DATA_TYPES.STRING
  },
  'optimization_goal': {
    'description': 'Specific goal to be optimized for in the campaign',
    'type': DATA_TYPES.STRING
  },
  'special_industries': {
    'description': 'Special industries classification for the campaign',
    'type': DATA_TYPES.STRING
  },
  'deep_bid_type': {
    'description': 'Type of deep bidding strategy',
    'type': DATA_TYPES.STRING
  },
  'rta_id': {
    'description': 'Real-time advertising ID',
    'type': DATA_TYPES.STRING,
  },
  'rta_product_selection_enabled': {
    'description': 'Flag indicating if RTA product selection is enabled',
    'type': DATA_TYPES.BOOLEAN
  },
  'budget': {
    'description': 'Campaign Budget',
    'type': DATA_TYPES.NUMBER
  },
  'is_new_structure': {
    'description': 'Flag indicating if the campaign utilizes a new campaign structure',
    'type': DATA_TYPES.BOOLEAN
  },
  'is_smart_performance_campaign': {
    'description': 'Flag indicating if the campaign uses smart performance optimization',
    'type': DATA_TYPES.BOOLEAN
  },
  'modify_time': {
    'description': 'Last Modified Time',
    'type': DATA_TYPES.DATETIME
  },
  'app_id': {
    'description': 'ID of the app being promoted',
    'type': DATA_TYPES.STRING,
  },
  'objective_type': {
    'description': 'Type of objective selected for the campaign (e.g., brand awareness, app installs)',
    'type': DATA_TYPES.STRING
  },
  'campaign_type': {
    'description': 'Type of campaign (e.g., awareness, conversion)',
    'type': DATA_TYPES.STRING
  },
  'campaign_app_profile_page_state': {
    'description': 'App profile page state for app campaigns',
    'type': DATA_TYPES.STRING
  },
  'create_time': {
    'description': 'Creation Time',
    'type': DATA_TYPES.DATETIME
  },
  'catalog_enabled': {
    'description': 'Flag indicating if product catalog is enabled',
    'type': DATA_TYPES.BOOLEAN
  },
  'bid_align_type': {
    'description': 'Type of bid alignment',
    'type': DATA_TYPES.STRING
  }
};
