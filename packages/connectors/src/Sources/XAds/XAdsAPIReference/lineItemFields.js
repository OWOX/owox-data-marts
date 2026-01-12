/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var lineItemFields = {
  'advertiser_user_id': {
    'description': 'ID of the advertiser user',
    'type': DATA_TYPES.STRING,
  },
  'name': {
    'description': 'Name of the line item',
    'type': DATA_TYPES.STRING
  },
  'placements': {
    'description': 'List of placement targets (e.g. ALL_ON_TWITTER)',
    'type': DATA_TYPES.ARRAY
  },
  'start_time': {
    'description': 'Line item start time',
    'type': DATA_TYPES.DATETIME
  },
  'bid_amount_local_micro': {
    'description': 'Bid amount in micro-currency units',
    'type': DATA_TYPES.INTEGER
  },
  'advertiser_domain': {
    'description': 'Domain of the advertiser',
    'type': DATA_TYPES.STRING
  },
  'target_cpa_local_micro': {
    'description': 'Target CPA (cost per action) in micro-currency units',
    'type': DATA_TYPES.INTEGER
  },
  'primary_web_event_tag': {
    'description': 'Primary web event tag identifier',
    'type': DATA_TYPES.STRING
  },
  'goal': {
    'description': 'Line item goal/objective (e.g. APP_INSTALLS)',
    'type': DATA_TYPES.STRING
  },
  'daily_budget_amount_local_micro': {
    'description': 'Daily budget in micro-currency units',
    'type': DATA_TYPES.INTEGER
  },
  'product_type': {
    'description': 'Product type (e.g. PROMOTED_TWEETS)',
    'type': DATA_TYPES.STRING
  },
  'end_time': {
    'description': 'Line item end time (nullable)',
    'type': DATA_TYPES.DATETIME
  },
  'funding_instrument_id': {
    'description': 'ID of the funding instrument',
    'type': DATA_TYPES.STRING,
  },
  'bid_strategy': {
    'description': 'Bidding strategy (e.g. AUTO)',
    'type': DATA_TYPES.STRING
  },
  'duration_in_days': {
    'description': 'Duration in days (nullable)',
    'type': DATA_TYPES.INTEGER
  },
  'standard_delivery': {
    'description': 'Whether standard delivery is enabled',
    'type': DATA_TYPES.BOOLEAN
  },
  'total_budget_amount_local_micro': {
    'description': 'Total budget in micro-currency units (nullable)',
    'type': DATA_TYPES.INTEGER
  },
  'objective': {
    'description': 'Campaign objective (duplicate of goal in some APIs)',
    'type': DATA_TYPES.STRING
  },
  'id': {
    'description': 'Unique identifier of the line item',
    'type': DATA_TYPES.STRING
  },
  'entity_status': {
    'description': 'Status of the line item (e.g. ACTIVE, PAUSED)',
    'type': DATA_TYPES.STRING
  },
  'automatic_tweet_promotion': {
    'description': 'Whether automatic tweet promotion is enabled',
    'type': DATA_TYPES.BOOLEAN
  },
  'frequency_cap': {
    'description': 'Frequency cap for ad serving',
    'type': DATA_TYPES.INTEGER
  },
  'android_app_store_identifier': {
    'description': 'Android app store identifier',
    'type': DATA_TYPES.STRING
  },
  'categories': {
    'description': 'Array of category labels',
    'type': DATA_TYPES.ARRAY
  },
  'currency': {
    'description': 'Currency code (e.g. USD)',
    'type': DATA_TYPES.STRING
  },
  'pay_by': {
    'description': 'Payment method (e.g. IMPRESSION)',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'Timestamp when the line item was created',
    'type': DATA_TYPES.DATETIME
  },
  'ios_app_store_identifier': {
    'description': 'iOS app store identifier',
    'type': DATA_TYPES.STRING
  },
  'updated_at': {
    'description': 'Timestamp when the line item was last updated',
    'type': DATA_TYPES.DATETIME
  },
  'campaign_id': {
    'description': 'ID of the parent campaign',
    'type': DATA_TYPES.STRING,
  },
  'creative_source': {
    'description': 'Source of the creative (e.g. MANUAL)',
    'type': DATA_TYPES.STRING
  },
  'audience_expansion': {
    'description': 'Audience expansion setting (e.g. EXPANDED)',
    'type': DATA_TYPES.STRING
  },
  'deleted': {
    'description': 'Whether the line item is marked as deleted',
    'type': DATA_TYPES.BOOLEAN
  }
}; 
