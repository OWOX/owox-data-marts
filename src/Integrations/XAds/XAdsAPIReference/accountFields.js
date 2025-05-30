/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var accountFields = {
  'name': {
    'description': 'The name of the account',
    'type': 'string'
  },
  'business_name': {
    'description': 'The business name associated with the account',
    'type': 'string'
  },
  'timezone': {
    'description': 'The timezone of the account',
    'type': 'string'
  },
  'timezone_switch_at': {
    'description': 'When the timezone was last switched',
    'type': 'datetime'
  },
  'country_code': {
    'description': 'The country code of the account (e.g. SI)',
    'type': 'string'
  },
  'id': {
    'description': 'The unique identifier for the account',
    'type': 'string'
  },
  'created_at': {
    'description': 'When the account was created',
    'type': 'datetime'
  },
  'updated_at': {
    'description': 'When the account was last updated',
    'type': 'datetime'
  },
  'industry_type': {
    'description': 'The industry type of the account',
    'type': 'string'
  },
  'business_id': {
    'description': 'The business identifier associated with the account',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'approval_status': {
    'description': 'The approval status of the account (e.g. ACCEPTED)',
    'type': 'string'
  },
  'deleted': {
    'description': 'Whether the account is deleted',
    'type': 'boolean'
  }
};
