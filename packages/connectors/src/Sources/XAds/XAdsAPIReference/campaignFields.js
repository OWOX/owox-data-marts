/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignFields = {
  'name': {
    'description': 'The name of the campaign',
    'type': DATA_TYPES.STRING
  },
  'budget_optimization': {
    'description': 'Budget optimization strategy (e.g. LINE_ITEM)',
    'type': DATA_TYPES.STRING
  },
  'reasons_not_servable': {
    'description': 'Reasons why the campaign is not servable',
    'type': DATA_TYPES.ARRAY
  },
  'servable': {
    'description': 'Whether the campaign is servable',
    'type': DATA_TYPES.BOOLEAN
  },
  'purchase_order_number': {
    'description': 'Purchase order number',
    'type': DATA_TYPES.STRING
  },
  'effective_status': {
    'description': 'Effective status of the campaign (e.g. PAUSED)',
    'type': DATA_TYPES.STRING
  },
  'daily_budget_amount_local_micro': {
    'description': 'Daily budget amount in micros (nullable)',
    'type': DATA_TYPES.INTEGER
  },
  'funding_instrument_id': {
    'description': 'ID of the funding instrument',
    'type': DATA_TYPES.STRING,
  },
  'duration_in_days': {
    'description': 'Duration of the campaign in days (nullable)',
    'type': DATA_TYPES.INTEGER
  },
  'standard_delivery': {
    'description': 'Whether standard delivery is enabled (nullable)',
    'type': DATA_TYPES.BOOLEAN
  },
  'total_budget_amount_local_micro': {
    'description': 'Total budget amount in micros (nullable)',
    'type': DATA_TYPES.INTEGER
  },
  'id': {
    'description': 'The unique identifier for the campaign',
    'type': DATA_TYPES.STRING
  },
  'entity_status': {
    'description': 'Entity status of the campaign',
    'type': DATA_TYPES.STRING
  },
  'frequency_cap': {
    'description': 'Frequency cap (nullable)',
    'type': DATA_TYPES.INTEGER
  },
  'currency': {
    'description': 'Currency code (e.g. USD)',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'Timestamp when the campaign was created',
    'type': DATA_TYPES.DATETIME
  },
  'updated_at': {
    'description': 'Timestamp when the campaign was last updated',
    'type': DATA_TYPES.DATETIME
  },
  'deleted': {
    'description': 'Whether the campaign is deleted',
    'type': DATA_TYPES.BOOLEAN
  },
  'account_id': {
    'description': 'ID of the account',
    'type': DATA_TYPES.STRING
  }
};
