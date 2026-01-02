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
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the article.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the article URL.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'handle'
  },
  'body': {
    'description': 'The text of the article body, complete with HTML markup.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'body'
  },
  'summary': {
    'description': 'A summary of the article, which can include HTML markup.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'summary'
  },
  'authorName': {
    'description': 'The name of the author of the article.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'author { name }'
  },
  'blogId': {
    'description': 'The ID of the blog containing the article.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'blog { id }'
  },
  'blogTitle': {
    'description': 'The title of the blog containing the article.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'blog { title }'
  },
  'isPublished': {
    'description': 'Whether or not the article is visible.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'isPublished'
  },
  'publishedAt': {
    'description': 'The date and time when the article became or will become visible.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'publishedAt'
  },
  'tags': {
    'description': 'A comma-separated list of tags.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'tags'
  },
  'templateSuffix': {
    'description': 'The name of the template the article is using.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'templateSuffix'
  },
  'imageUrl': {
    'description': 'The URL of the image associated with the article.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'image { url }'
  },
  'createdAt': {
    'description': 'The date and time when the article was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the article was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
