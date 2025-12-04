/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Blog

var blogsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the blog.',
    'type': 'string',
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the blog URL.',
    'type': 'string',
    'graphqlPath': 'handle'
  },
  'commentable': {
    'description': 'Indicates whether readers can post comments to the blog.',
    'type': 'string',
    'graphqlPath': 'commentable'
  },
  'templateSuffix': {
    'description': 'The name of the template the blog is using.',
    'type': 'string',
    'graphqlPath': 'templateSuffix'
  },
  'createdAt': {
    'description': 'The date and time when the blog was created.',
    'type': 'datetime',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the blog was last updated.',
    'type': 'datetime',
    'graphqlPath': 'updatedAt'
  }
};
