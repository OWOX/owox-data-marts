/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Article

var articlesFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the article.',
    'type': 'string',
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the article URL.',
    'type': 'string',
    'graphqlPath': 'handle'
  },
  'body': {
    'description': 'The text of the article body, complete with HTML markup.',
    'type': 'string',
    'graphqlPath': 'body'
  },
  'summary': {
    'description': 'A summary of the article, which can include HTML markup.',
    'type': 'string',
    'graphqlPath': 'summary'
  },
  'authorName': {
    'description': 'The name of the author of the article.',
    'type': 'string',
    'graphqlPath': 'author { name }'
  },
  'blogId': {
    'description': 'The ID of the blog containing the article.',
    'type': 'string',
    'graphqlPath': 'blog { id }'
  },
  'blogTitle': {
    'description': 'The title of the blog containing the article.',
    'type': 'string',
    'graphqlPath': 'blog { title }'
  },
  'isPublished': {
    'description': 'Whether or not the article is visible.',
    'type': 'bool',
    'graphqlPath': 'isPublished'
  },
  'publishedAt': {
    'description': 'The date and time when the article became or will become visible.',
    'type': 'timestamp',
    'graphqlPath': 'publishedAt'
  },
  'tags': {
    'description': 'A comma-separated list of tags.',
    'type': 'string',
    'graphqlPath': 'tags'
  },
  'templateSuffix': {
    'description': 'The name of the template the article is using.',
    'type': 'string',
    'graphqlPath': 'templateSuffix'
  },
  'imageUrl': {
    'description': 'The URL of the image associated with the article.',
    'type': 'string',
    'graphqlPath': 'image { url }'
  },
  'createdAt': {
    'description': 'The date and time when the article was created.',
    'type': 'timestamp',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the article was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt'
  }
};
