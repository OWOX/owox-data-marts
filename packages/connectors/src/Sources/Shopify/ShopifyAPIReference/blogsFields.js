/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Blog

var blogsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the blog.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the blog URL.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'handle'
  },
  'templateSuffix': {
    'description': 'The name of the template the blog is using.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'templateSuffix'
  },
  'createdAt': {
    'description': 'The date and time when the blog was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the blog was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
