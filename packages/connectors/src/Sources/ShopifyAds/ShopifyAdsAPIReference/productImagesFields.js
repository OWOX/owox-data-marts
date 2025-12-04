/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/MediaImage

var productImagesFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'url': {
    'description': 'The URL of the image.',
    'type': 'string',
    'graphqlPath': 'image { url }'
  },
  'altText': {
    'description': 'The alt text of the image.',
    'type': 'string',
    'graphqlPath': 'alt'
  },
  'width': {
    'description': 'The width of the image.',
    'type': 'int32',
    'graphqlPath': 'image { width }'
  },
  'height': {
    'description': 'The height of the image.',
    'type': 'int32',
    'graphqlPath': 'image { height }'
  },
  'productId': {
    'description': 'The ID of the product.',
    'type': 'string',
    'graphqlPath': 'product { id }'
  },
  'createdAt': {
    'description': 'The date and time when the image was created.',
    'type': 'datetime',
    'graphqlPath': 'createdAt'
  }
};
