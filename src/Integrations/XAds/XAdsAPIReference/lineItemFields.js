/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var lineItemFields = {
  'advertiser_user_id': {
    'description': 'ID of the advertiser user',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'name': {
    'description': 'Name of the line item',
    'type': 'string'
  },
  'placements': {
    'description': 'List of placement targets (e.g. ALL_ON_TWITTER)',
    'type': 'string[]'
  },
  'start_time': {
    'description': 'Line item start time',
    'type': 'datetime'
  },
  'bid_amount_local_micro': {
    'description': 'Bid amount in micro-currency units',
    'type': 'integer'
  },
  'advertiser_domain': {
    'description': 'Domain of the advertiser',
    'type': 'string'
  },
  'target_cpa_local_micro': {
    'description': 'Target CPA (cost per action) in micro-currency units',
    'type': 'integer'
  },
  'primary_web_event_tag': {
    'description': 'Primary web event tag identifier',
    'type': 'string'
  },
  'goal': {
    'description': 'Line item goal/objective (e.g. APP_INSTALLS)',
    'type': 'string'
  },
  'daily_budget_amount_local_micro': {
    'description': 'Daily budget in micro-currency units',
    'type': 'integer'
  },
  'product_type': {
    'description': 'Product type (e.g. PROMOTED_TWEETS)',
    'type': 'string'
  },
  'end_time': {
    'description': 'Line item end time (nullable)',
    'type': 'datetime'
  },
  'funding_instrument_id': {
    'description': 'ID of the funding instrument',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'bid_strategy': {
    'description': 'Bidding strategy (e.g. AUTO)',
    'type': 'string'
  },
  'duration_in_days': {
    'description': 'Duration in days (nullable)',
    'type': 'integer'
  },
  'standard_delivery': {
    'description': 'Whether standard delivery is enabled',
    'type': 'boolean'
  },
  'total_budget_amount_local_micro': {
    'description': 'Total budget in micro-currency units (nullable)',
    'type': 'integer'
  },
  'objective': {
    'description': 'Campaign objective (duplicate of goal in some APIs)',
    'type': 'string'
  },
  'id': {
    'description': 'Unique identifier of the line item',
    'type': 'string'
  },
  'entity_status': {
    'description': 'Status of the line item (e.g. ACTIVE, PAUSED)',
    'type': 'string'
  },
  'automatic_tweet_promotion': {
    'description': 'Whether automatic tweet promotion is enabled',
    'type': 'boolean'
  },
  'frequency_cap': {
    'description': 'Frequency cap for ad serving',
    'type': 'integer'
  },
  'android_app_store_identifier': {
    'description': 'Android app store identifier',
    'type': 'string'
  },
  'categories': {
    'description': 'Array of category labels',
    'type': 'string[]'
  },
  'currency': {
    'description': 'Currency code (e.g. USD)',
    'type': 'string'
  },
  'pay_by': {
    'description': 'Payment method (e.g. IMPRESSION)',
    'type': 'string'
  },
  'created_at': {
    'description': 'Timestamp when the line item was created',
    'type': 'datetime'
  },
  'ios_app_store_identifier': {
    'description': 'iOS app store identifier',
    'type': 'string'
  },
  'updated_at': {
    'description': 'Timestamp when the line item was last updated',
    'type': 'datetime'
  },
  'campaign_id': {
    'description': 'ID of the parent campaign',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'creative_source': {
    'description': 'Source of the creative (e.g. MANUAL)',
    'type': 'string'
  },
  'audience_expansion': {
    'description': 'Audience expansion setting (e.g. EXPANDED)',
    'type': 'string'
  },
  'deleted': {
    'description': 'Whether the line item is marked as deleted',
    'type': 'boolean'
  }
}; 
