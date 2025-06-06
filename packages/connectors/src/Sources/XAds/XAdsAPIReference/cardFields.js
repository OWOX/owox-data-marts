/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var cardFields = {
  'id': {
    'description': 'The unique identifier for the card.',
    'type': 'string'
  },
  'name': {
    'description': 'The name of the card.',
    'type': 'string'
  },
  'card_type': {
    'description': 'Type of the card.',
    'type': 'string'
  },
  'card_uri': {
    'description': 'URI of the card.',
    'type': 'string'
  },
  'created_at': {
    'description': 'When the card was created.',
    'type': 'datetime'
  },
  'updated_at': {
    'description': 'When the card was last updated.',
    'type': 'datetime'
  },
  'deleted': {
    'description': 'Whether the card is deleted.',
    'type': 'boolean'
  },
  'components': {
    'description': 'Card components including media and buttons.',
    'type': 'array'
  }
};
