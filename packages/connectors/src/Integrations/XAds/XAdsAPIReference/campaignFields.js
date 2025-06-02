/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignFields = {
  'name': {
    'description': 'The name of the campaign',
    'type': 'string'
  },
  'budget_optimization': {
    'description': 'Budget optimization strategy (e.g. LINE_ITEM)',
    'type': 'string'
  },
  'reasons_not_servable': {
    'description': 'Reasons why the campaign is not servable',
    'type': 'string[]'
  },
  'servable': {
    'description': 'Whether the campaign is servable',
    'type': 'boolean'
  },
  'purchase_order_number': {
    'description': 'Purchase order number',
    'type': 'string'
  },
  'effective_status': {
    'description': 'Effective status of the campaign (e.g. PAUSED)',
    'type': 'string'
  },
  'daily_budget_amount_local_micro': {
    'description': 'Daily budget amount in micros (nullable)',
    'type': 'integer'
  },
  'funding_instrument_id': {
    'description': 'ID of the funding instrument',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'duration_in_days': {
    'description': 'Duration of the campaign in days (nullable)',
    'type': 'integer'
  },
  'standard_delivery': {
    'description': 'Whether standard delivery is enabled (nullable)',
    'type': 'boolean'
  },
  'total_budget_amount_local_micro': {
    'description': 'Total budget amount in micros (nullable)',
    'type': 'integer'
  },
  'id': {
    'description': 'The unique identifier for the campaign',
    'type': 'string'
  },
  'entity_status': {
    'description': 'Entity status of the campaign',
    'type': 'string'
  },
  'frequency_cap': {
    'description': 'Frequency cap (nullable)',
    'type': 'integer'
  },
  'currency': {
    'description': 'Currency code (e.g. USD)',
    'type': 'string'
  },
  'created_at': {
    'description': 'Timestamp when the campaign was created',
    'type': 'datetime'
  },
  'updated_at': {
    'description': 'Timestamp when the campaign was last updated',
    'type': 'datetime'
  },
  'deleted': {
    'description': 'Whether the campaign is deleted',
    'type': 'boolean'
  },
  'account_id': {
    'description': 'ID of the account',
    'type': 'string'
  }
};
