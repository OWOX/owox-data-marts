/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Collection

var collectionsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the collection.',
    'type': 'string',
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the collection URL.',
    'type': 'string',
    'graphqlPath': 'handle'
  },
  'description': {
    'description': 'The description of the collection, including any HTML tags and formatting.',
    'type': 'string',
    'graphqlPath': 'description'
  },
  'descriptionHtml': {
    'description': 'The description of the collection in HTML format.',
    'type': 'string',
    'graphqlPath': 'descriptionHtml'
  },
  'sortOrder': {
    'description': 'The order in which the products in the collection are displayed.',
    'type': 'string',
    'graphqlPath': 'sortOrder'
  },
  'templateSuffix': {
    'description': 'The name of the template the collection is using.',
    'type': 'string',
    'graphqlPath': 'templateSuffix'
  },
  'productsCount': {
    'description': 'The number of products in the collection.',
    'type': 'int32',
    'graphqlPath': 'productsCount { count }'
  },
  'imageUrl': {
    'description': 'The URL of the image associated with the collection.',
    'type': 'string',
    'graphqlPath': 'image { url }'
  },
  'updatedAt': {
    'description': 'The date and time when the collection was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt'
  }
};
