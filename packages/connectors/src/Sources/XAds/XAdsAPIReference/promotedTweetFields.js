/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var promotedTweetFields = {
  'line_item_id': {
    'description': 'ID of the parent line item',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'id': {
    'description': 'Unique identifier for the promoted tweet',
    'type': 'string'
  },
  'entity_status': {
    'description': 'Status of the promoted tweet (e.g., ACTIVE, PAUSED)',
    'type': 'string'
  },
  'created_at': {
    'description': 'Timestamp when the promoted tweet was created',
    'type': 'datetime'
  },
  'updated_at': {
    'description': 'Timestamp when the promoted tweet was last updated',
    'type': 'datetime'
  },
  'approval_status': {
    'description': 'Approval status of the promoted tweet (e.g., ACCEPTED, REJECTED)',
    'type': 'string'
  },
  'tweet_id': {
    'description': 'ID of the original tweet',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'deleted': {
    'description': 'Flag indicating whether the promoted tweet has been deleted',
    'type': 'boolean'
  }
};
