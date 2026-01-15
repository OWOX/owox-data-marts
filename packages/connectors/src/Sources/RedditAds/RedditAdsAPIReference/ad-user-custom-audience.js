/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var userCustomAudienceFields = {
  'name': {
    'description': 'The name of the custom audience.',
    'type': DATA_TYPES.STRING
  },
  'id': {
    'description': 'The ID of the custom audience.',
    'type': DATA_TYPES.STRING
  },
  'status': {
    'description': 'The processing status of the custom audience. A custom audience is only VALID if size_range_upper is at or above 1,000 users, otherwise it will be in the NOT_ENOUGH_MATCHES_ERROR state.',
    'type': DATA_TYPES.STRING
  },
  'ad_account_id': {
    'description': 'The ID of the ad account that owns this custom audience.',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'The time that this entity was created, represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'modified_at': {
    'description': 'The last time that this entity was modified, represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'size_range_upper': {
    'description': 'High estimate of the number of matched users in the audience.',
    'type': DATA_TYPES.INTEGER
  },
  'size_range_lower': {
    'description': 'Low estimate of the number of matched users in the audience.',
    'type': DATA_TYPES.INTEGER
  },
  'type': {
    'description': 'The type of the Custom Audience.',
    'type': DATA_TYPES.STRING
  }
};
