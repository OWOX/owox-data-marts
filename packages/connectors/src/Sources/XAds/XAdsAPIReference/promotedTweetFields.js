/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var promotedTweetFields = {
  'line_item_id': {
    'description': 'ID of the parent line item',
    'type': DATA_TYPES.STRING,
  },
  'id': {
    'description': 'Unique identifier for the promoted tweet',
    'type': DATA_TYPES.STRING
  },
  'entity_status': {
    'description': 'Status of the promoted tweet (e.g., ACTIVE, PAUSED)',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'Timestamp when the promoted tweet was created',
    'type': DATA_TYPES.DATETIME
  },
  'updated_at': {
    'description': 'Timestamp when the promoted tweet was last updated',
    'type': DATA_TYPES.DATETIME
  },
  'approval_status': {
    'description': 'Approval status of the promoted tweet (e.g., ACCEPTED, REJECTED)',
    'type': DATA_TYPES.STRING
  },
  'tweet_id': {
    'description': 'ID of the original tweet',
    'type': DATA_TYPES.STRING,  
  },
  'deleted': {
    'description': 'Flag indicating whether the promoted tweet has been deleted',
    'type': DATA_TYPES.BOOLEAN
  }
};
