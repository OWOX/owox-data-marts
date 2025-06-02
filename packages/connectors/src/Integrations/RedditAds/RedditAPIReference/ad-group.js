/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adGroupFields = {
    'ad_account_id': {
      'description': 'The ID of the ad account that the ad group belongs to.',
      'type': 'string'
    },
    'app_id': {
      'description': 'The App ID of the app in the mobile app store (iOS App Store, Google Play Store).',
      'type': 'string'
    },
    'bid_strategy': {
      'description': 'The bid strategy for the ad group.',
      'type': 'string'
    },
    'bid_type': {
      'description': 'The bidding strategy for the ad group.',
      'type': 'string'
    },
    'bid_value': {
      'description': 'The amount to pay in microcurrency per bidding event.',
      'type': 'integer'
    },
    'campaign_id': {
      'description': 'The ID of the campaign the ad group belongs to.',
      'type': 'string'
    },
    'campaign_objective_type': {
      'description': 'The objective type of a campaign.',
      'type': 'string'
    },
    'configured_status': {
      'description': 'The status of the ad group configured by the account owner.',
      'type': 'string'
    },
    'created_at': {
      'description': 'The time that this entity was created, represented in ISO 8601.',
      'type': 'string'
    },
    'effective_status': {
      'description': 'The effective status of the ad group in the system.',
      'type': 'string'
    },
    'end_time': {
      'description': 'ISO 8601 timestamp when the ad group will stop delivering.',
      'type': 'string'
    },
    'goal_type': {
      'description': 'The type of goal for the ad group.',
      'type': 'string'
    },
    'goal_value': {
      'description': 'The value used to determine if the goal has been met. Measured in microcurrency for monetary goal types.',
      'type': 'integer'
    },
    'id': {
      'description': 'The ID of the ad group.',
      'type': 'string'
    },
    'modified_at': {
      'description': 'The last time that this entity was modified, represented in ISO 8601.',
      'type': 'string'
    },
    'name': {
      'description': 'The name of the ad group.',
      'type': 'string'
    },
    'optimization_strategy_type': {
      'description': 'Deprecated - The type of optimization strategy.',
      'type': 'string'
    },
    'optimization_goal': {
      'description': 'The event you want to measure. Required for conversion and app install campaign objectives.',
      'type': 'string'
    },
    'product_set_id': {
      'description': 'The product set to associate with this ad group.',
      'type': 'string'
    },
    'schedule': {
      'description': 'A list of times to run the ad group.',
      'type': 'string'
    },
    'shopping_targeting': {
      'description': 'A container for shopping ad tracking-related fields.',
      'type': 'string'
    },
    'shopping_type': {
      'description': 'The type of ads an ad group should contain for shopping ads.',
      'type': 'string'
    },
    'skadnetwork_metadata': {
      'description': 'Metadata about the SKAdNetwork source ID associated with the ad group.',
      'type': 'string'
    },
    'start_time': {
      'description': 'ISO 8601 timestamp when the ad group will begin to deliver.',
      'type': 'string'
    },
    'targeting': {
      'description': 'Targeting information for the ad group.',
      'type': 'string'
    },
    'is_campaign_budget_optimization': {
      'description': 'Determines if the ad group belongs to a CBO (campaign-budget-optimization) campaign.',
      'type': 'boolean'
    },
    'view_through_conversion_type': {
      'description': 'The type of view-through conversion being measured.',
      'type': 'string'
    }
};