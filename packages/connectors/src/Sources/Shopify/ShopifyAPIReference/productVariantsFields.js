/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/ProductVariant

var productVariantsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the variant.',
    'type': 'string',
    'graphqlPath': 'title'
  },
  'displayName': {
    'description': 'The display name of the variant.',
    'type': 'string',
    'graphqlPath': 'displayName'
  },
  'sku': {
    'description': 'The SKU of the variant.',
    'type': 'string',
    'graphqlPath': 'sku'
  },
  'barcode': {
    'description': 'The barcode of the variant.',
    'type': 'string',
    'graphqlPath': 'barcode'
  },
  'price': {
    'description': 'The price of the variant.',
    'type': 'float',
    'graphqlPath': 'price'
  },
  'compareAtPrice': {
    'description': 'The compare at price of the variant.',
    'type': 'float',
    'graphqlPath': 'compareAtPrice'
  },
  'position': {
    'description': 'The position of the variant in the list.',
    'type': 'int32',
    'graphqlPath': 'position'
  },
  'inventoryQuantity': {
    'description': 'The total inventory quantity.',
    'type': 'int32',
    'graphqlPath': 'inventoryQuantity'
  },
  'inventoryPolicy': {
    'description': 'The inventory policy.',
    'type': 'string',
    'graphqlPath': 'inventoryPolicy'
  },
  'inventoryItemId': {
    'description': 'The ID of the inventory item.',
    'type': 'string',
    'graphqlPath': 'inventoryItem { id }'
  },
  'productId': {
    'description': 'The ID of the product.',
    'type': 'string',
    'graphqlPath': 'product { id }'
  },
  'productTitle': {
    'description': 'The title of the product.',
    'type': 'string',
    'graphqlPath': 'product { title }'
  },
  'taxable': {
    'description': 'Whether the variant is taxable.',
    'type': 'bool',
    'graphqlPath': 'taxable'
  },
  'taxCode': {
    'description': 'The tax code.',
    'type': 'string',
    'graphqlPath': 'taxCode'
  },
  'availableForSale': {
    'description': 'Whether the variant is available for sale.',
    'type': 'bool',
    'graphqlPath': 'availableForSale'
  },
  'createdAt': {
    'description': 'The date and time when the variant was created.',
    'type': 'timestamp',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the variant was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt'
  }
};
