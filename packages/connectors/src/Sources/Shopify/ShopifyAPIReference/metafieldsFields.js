/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Metafield
// Used for all metafield_* nodes

var metafieldsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'namespace': {
    'description': 'The namespace of the metafield.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'namespace'
  },
  'key': {
    'description': 'The key of the metafield.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'key'
  },
  'value': {
    'description': 'The value of the metafield.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'value'
  },
  'type': {
    'description': 'The type of the metafield.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'type'
  },
  'ownerId': {
    'description': 'The ID of the owner resource.',
    'type': DATA_TYPES.STRING
  },
  'ownerType': {
    'description': 'The type of the owner resource.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'ownerType'
  },
  'createdAt': {
    'description': 'The date and time when the metafield was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the metafield was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
