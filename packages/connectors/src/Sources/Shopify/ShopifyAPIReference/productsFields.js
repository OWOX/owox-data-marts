/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Product

var productsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the product.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the product URL.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'handle'
  },
  'description': {
    'description': 'The description of the product.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'description'
  },
  'descriptionHtml': {
    'description': 'The description of the product in HTML format.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'descriptionHtml'
  },
  'vendor': {
    'description': 'The name of the product vendor.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'vendor'
  },
  'productType': {
    'description': 'The product type.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'productType'
  },
  'status': {
    'description': 'The status of the product.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'status'
  },
  'tags': {
    'description': 'A comma-separated list of tags.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'tags'
  },
  'templateSuffix': {
    'description': 'The name of the template the product is using.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'templateSuffix'
  },
  'totalInventory': {
    'description': 'The total inventory across all variants.',
    'type': DATA_TYPES.INTEGER,
    'graphqlPath': 'totalInventory'
  },
  'variantsCount': {
    'description': 'The number of variants.',
    'type': DATA_TYPES.INTEGER,
    'graphqlPath': 'variantsCount { count }'
  },
  'featuredImageUrl': {
    'description': 'The URL of the featured image.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'featuredImage { url }'
  },
  'priceRangeMinAmount': {
    'description': 'The minimum price of the product.',
    'type': DATA_TYPES.NUMBER,
    'graphqlPath': 'priceRangeV2 { minVariantPrice { amount } }'
  },
  'priceRangeMaxAmount': {
    'description': 'The maximum price of the product.',
    'type': DATA_TYPES.NUMBER,
    'graphqlPath': 'priceRangeV2 { maxVariantPrice { amount } }'
  },
  'seoTitle': {
    'description': 'The SEO title.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'seo { title }'
  },
  'seoDescription': {
    'description': 'The SEO description.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'seo { description }'
  },
  'onlineStoreUrl': {
    'description': 'The URL of the product on the online store.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'onlineStoreUrl'
  },
  'publishedAt': {
    'description': 'The date and time when the product was published.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'publishedAt'
  },
  'createdAt': {
    'description': 'The date and time when the product was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the product was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
