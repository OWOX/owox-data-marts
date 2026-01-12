/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Page

var pagesFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the page.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the page URL.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'handle'
  },
  'body': {
    'description': 'The body content of the page.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'body'
  },
  'bodySummary': {
    'description': 'A summary of the body content.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'bodySummary'
  },
  'isPublished': {
    'description': 'Whether the page is published.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'isPublished'
  },
  'templateSuffix': {
    'description': 'The name of the template the page is using.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'templateSuffix'
  },
  'publishedAt': {
    'description': 'The date and time when the page was published.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'publishedAt'
  },
  'createdAt': {
    'description': 'The date and time when the page was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the page was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
