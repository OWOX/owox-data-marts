/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Page

var pagesFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the page.',
    'type': 'string',
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the page URL.',
    'type': 'string',
    'graphqlPath': 'handle'
  },
  'body': {
    'description': 'The body content of the page.',
    'type': 'string',
    'graphqlPath': 'body'
  },
  'bodySummary': {
    'description': 'A summary of the body content.',
    'type': 'string',
    'graphqlPath': 'bodySummary'
  },
  'isPublished': {
    'description': 'Whether the page is published.',
    'type': 'bool',
    'graphqlPath': 'isPublished'
  },
  'templateSuffix': {
    'description': 'The name of the template the page is using.',
    'type': 'string',
    'graphqlPath': 'templateSuffix'
  },
  'publishedAt': {
    'description': 'The date and time when the page was published.',
    'type': 'datetime',
    'graphqlPath': 'publishedAt'
  },
  'createdAt': {
    'description': 'The date and time when the page was created.',
    'type': 'datetime',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the page was last updated.',
    'type': 'datetime',
    'graphqlPath': 'updatedAt'
  }
};
