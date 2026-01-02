/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var audiencesFields = {
  'audience_id': {
    'description': 'Unique identifier for the audience',
    'type': DATA_TYPES.STRING,
  },
  'advertiser_id': {
    'description': 'Advertiser ID',
    'type': DATA_TYPES.STRING,
  },
  'name': {
    'description': 'Name of the audience',
    'type': DATA_TYPES.STRING
  },
  'audience_type': {
    'description': 'Type of audience (e.g., demographic, interest-based)',
    'type': DATA_TYPES.STRING
  },
  'cover_num': {
    'description': 'Number of audience members covered',
    'type': DATA_TYPES.INTEGER
  },
  'create_time': {
    'description': 'Timestamp indicating when the audience was created',
    'type': DATA_TYPES.DATETIME
  },
  'is_valid': {
    'description': 'Flag indicating if the audience data is valid',
    'type': DATA_TYPES.BOOLEAN
  },
  'is_expiring': {
    'description': 'Flag indicating if the audience data is expiring soon',
    'type': DATA_TYPES.BOOLEAN
  },
  'expired_time': {
    'description': 'Timestamp indicating when the audience data expires',
    'type': DATA_TYPES.DATETIME
  }
};
