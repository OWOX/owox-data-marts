/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Product

var productsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the product.',
    'type': 'string',
    'graphqlPath': 'title'
  },
  'handle': {
    'description': 'A unique, human-friendly string for the product URL.',
    'type': 'string',
    'graphqlPath': 'handle'
  },
  'description': {
    'description': 'The description of the product.',
    'type': 'string',
    'graphqlPath': 'description'
  },
  'descriptionHtml': {
    'description': 'The description of the product in HTML format.',
    'type': 'string',
    'graphqlPath': 'descriptionHtml'
  },
  'vendor': {
    'description': 'The name of the product vendor.',
    'type': 'string',
    'graphqlPath': 'vendor'
  },
  'productType': {
    'description': 'The product type.',
    'type': 'string',
    'graphqlPath': 'productType'
  },
  'status': {
    'description': 'The status of the product.',
    'type': 'string',
    'graphqlPath': 'status'
  },
  'tags': {
    'description': 'A comma-separated list of tags.',
    'type': 'string',
    'graphqlPath': 'tags'
  },
  'templateSuffix': {
    'description': 'The name of the template the product is using.',
    'type': 'string',
    'graphqlPath': 'templateSuffix'
  },
  'totalInventory': {
    'description': 'The total inventory across all variants.',
    'type': 'int32',
    'graphqlPath': 'totalInventory'
  },
  'variantsCount': {
    'description': 'The number of variants.',
    'type': 'int32',
    'graphqlPath': 'variantsCount { count }'
  },
  'imagesCount': {
    'description': 'The number of images.',
    'type': 'int32',
    'graphqlPath': 'imagesCount { count }'
  },
  'featuredImageUrl': {
    'description': 'The URL of the featured image.',
    'type': 'string',
    'graphqlPath': 'featuredImage { url }'
  },
  'priceRangeMinAmount': {
    'description': 'The minimum price of the product.',
    'type': 'float',
    'graphqlPath': 'priceRangeV2 { minVariantPrice { amount } }'
  },
  'priceRangeMaxAmount': {
    'description': 'The maximum price of the product.',
    'type': 'float',
    'graphqlPath': 'priceRangeV2 { maxVariantPrice { amount } }'
  },
  'seoTitle': {
    'description': 'The SEO title.',
    'type': 'string',
    'graphqlPath': 'seo { title }'
  },
  'seoDescription': {
    'description': 'The SEO description.',
    'type': 'string',
    'graphqlPath': 'seo { description }'
  },
  'onlineStoreUrl': {
    'description': 'The URL of the product on the online store.',
    'type': 'string',
    'graphqlPath': 'onlineStoreUrl'
  },
  'publishedAt': {
    'description': 'The date and time when the product was published.',
    'type': 'datetime',
    'graphqlPath': 'publishedAt'
  },
  'createdAt': {
    'description': 'The date and time when the product was created.',
    'type': 'datetime',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the product was last updated.',
    'type': 'datetime',
    'graphqlPath': 'updatedAt'
  }
};
