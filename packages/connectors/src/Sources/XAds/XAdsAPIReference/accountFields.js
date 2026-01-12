/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var accountFields = {
  'name': {
    'description': 'The name of the account',
    'type': DATA_TYPES.STRING
  },
  'business_name': {
    'description': 'The business name associated with the account',
    'type': DATA_TYPES.STRING
  },
  'timezone': {
    'description': 'The timezone of the account',
    'type': DATA_TYPES.STRING
  },
  'timezone_switch_at': {
    'description': 'When the timezone was last switched',
    'type': DATA_TYPES.DATETIME
  },
  'country_code': {
    'description': 'The country code of the account (e.g. SI)',
    'type': DATA_TYPES.STRING
  },
  'id': {
    'description': 'The unique identifier for the account',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'When the account was created',
    'type': DATA_TYPES.DATETIME
  },
  'updated_at': {
    'description': 'When the account was last updated',
    'type': DATA_TYPES.DATETIME
  },
  'industry_type': {
    'description': 'The industry type of the account',
    'type': DATA_TYPES.STRING
  },
  'business_id': {
    'description': 'The business identifier associated with the account',
    'type': DATA_TYPES.STRING,
  },
  'approval_status': {
    'description': 'The approval status of the account (e.g. ACCEPTED)',
    'type': DATA_TYPES.STRING
  },
  'deleted': {
    'description': 'Whether the account is deleted',
    'type': DATA_TYPES.BOOLEAN
  }
};
