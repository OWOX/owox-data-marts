/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var cardFields = {
  'id': {
    'description': 'The unique identifier for the card.',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'The name of the card.',
    'type': DATA_TYPES.STRING
  },
  'card_type': {
    'description': 'Type of the card.',
    'type': DATA_TYPES.STRING
  },
  'card_uri': {
    'description': 'URI of the card.',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'When the card was created.',
    'type': DATA_TYPES.DATETIME
  },
  'updated_at': {
    'description': 'When the card was last updated.',
    'type': DATA_TYPES.DATETIME
  },
  'deleted': {
    'description': 'Whether the card is deleted.',
    'type': DATA_TYPES.BOOLEAN
  },
  'components': {
    'description': 'Card components including media and buttons.',
    'type': DATA_TYPES.ARRAY
  }
};
