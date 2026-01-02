/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adGroupFields = {
  'ad_account_id': {
    'description': 'The ID of the ad account that the ad group belongs to.',
    'type': DATA_TYPES.STRING
  },
  'app_id': {
    'description': 'The App ID of the app in the mobile app store (iOS App Store, Google Play Store).',
    'type': DATA_TYPES.STRING
  },
  'bid_strategy': {
    'description': 'The bid strategy for the ad group.',
    'type': DATA_TYPES.STRING
  },
  'bid_type': {
    'description': 'The bidding strategy for the ad group.',
    'type': DATA_TYPES.STRING
  },
  'bid_value': {
    'description': 'The amount to pay in microcurrency per bidding event.',
    'type': DATA_TYPES.INTEGER
  },
  'campaign_id': {
    'description': 'The ID of the campaign the ad group belongs to.',
    'type': DATA_TYPES.STRING
  },
  'campaign_objective_type': {
    'description': 'The objective type of a campaign.',
    'type': DATA_TYPES.STRING
  },
  'configured_status': {
    'description': 'The status of the ad group configured by the account owner.',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'The time that this entity was created, represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'effective_status': {
    'description': 'The effective status of the ad group in the system.',
    'type': DATA_TYPES.STRING
  },
  'end_time': {
    'description': 'ISO 8601 timestamp when the ad group will stop delivering.',
    'type': DATA_TYPES.STRING
  },
  'goal_type': {
    'description': 'The type of goal for the ad group.',
    'type': DATA_TYPES.STRING
  },
  'goal_value': {
    'description': 'The value used to determine if the goal has been met. Measured in microcurrency for monetary goal types.',
    'type': DATA_TYPES.INTEGER
  },
  'id': {
    'description': 'The ID of the ad group.',
    'type': DATA_TYPES.STRING
  },
  'modified_at': {
    'description': 'The last time that this entity was modified, represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'The name of the ad group.',
    'type': DATA_TYPES.STRING
  },
  'optimization_strategy_type': {
    'description': 'Deprecated - The type of optimization strategy.',
    'type': DATA_TYPES.STRING
  },
  'optimization_goal': {
    'description': 'The event you want to measure. Required for conversion and app install campaign objectives.',
    'type': DATA_TYPES.STRING
  },
  'product_set_id': {
    'description': 'The product set to associate with this ad group.',
    'type': DATA_TYPES.STRING
  },
  'schedule': {
    'description': 'A list of times to run the ad group.',
    'type': DATA_TYPES.STRING
  },
  'shopping_targeting': {
    'description': 'A container for shopping ad tracking-related fields.',
    'type': DATA_TYPES.STRING
  },
  'shopping_type': {
    'description': 'The type of ads an ad group should contain for shopping ads.',
    'type': DATA_TYPES.STRING
  },
  'skadnetwork_metadata': {
    'description': 'Metadata about the SKAdNetwork source ID associated with the ad group.',
    'type': DATA_TYPES.STRING
  },
  'start_time': {
    'description': 'ISO 8601 timestamp when the ad group will begin to deliver.',
    'type': DATA_TYPES.STRING
  },
  'targeting': {
    'description': 'Targeting information for the ad group.',
    'type': DATA_TYPES.STRING
  },
  'is_campaign_budget_optimization': {
    'description': 'Determines if the ad group belongs to a CBO (campaign-budget-optimization) campaign.',
    'type': DATA_TYPES.BOOLEAN
  },
  'view_through_conversion_type': {
    'description': 'The type of view-through conversion being measured.',
    'type': DATA_TYPES.STRING
  }
};
