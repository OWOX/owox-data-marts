/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var audiencesFields = {
  'audience_id': {
    'description': 'Unique identifier for the audience',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'advertiser_id': {
    'description': 'Advertiser ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'name': {
    'description': 'Name of the audience',
    'type': 'string'
  },
  'audience_type': {
    'description': 'Type of audience (e.g., demographic, interest-based)',
    'type': 'string'
  },
  'cover_num': {
    'description': 'Number of audience members covered',
    'type': 'int32'
  },
  'create_time': {
    'description': 'Timestamp indicating when the audience was created',
    'type': 'datetime'
  },
  'is_valid': {
    'description': 'Flag indicating if the audience data is valid',
    'type': 'bool'
  },
  'is_expiring': {
    'description': 'Flag indicating if the audience data is expiring soon',
    'type': 'bool'
  },
  'expired_time': {
    'description': 'Timestamp indicating when the audience data expires',
    'type': 'datetime'
  }
};
