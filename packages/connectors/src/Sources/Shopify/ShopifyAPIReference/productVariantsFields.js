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
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'title': {
    'description': 'The title of the variant.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'title'
  },
  'displayName': {
    'description': 'The display name of the variant.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'displayName'
  },
  'sku': {
    'description': 'The SKU of the variant.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'sku'
  },
  'barcode': {
    'description': 'The barcode of the variant.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'barcode'
  },
  'price': {
    'description': 'The price of the variant.',
    'type': DATA_TYPES.NUMBER,
    'graphqlPath': 'price'
  },
  'compareAtPrice': {
    'description': 'The compare at price of the variant.',
    'type': DATA_TYPES.NUMBER,
    'graphqlPath': 'compareAtPrice'
  },
  'position': {
    'description': 'The position of the variant in the list.',
    'type': DATA_TYPES.INTEGER,
    'graphqlPath': 'position'
  },
  'inventoryQuantity': {
    'description': 'The total inventory quantity.',
    'type': DATA_TYPES.INTEGER,
    'graphqlPath': 'inventoryQuantity'
  },
  'inventoryPolicy': {
    'description': 'The inventory policy.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'inventoryPolicy'
  },
  'inventoryItemId': {
    'description': 'The ID of the inventory item.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'inventoryItem { id }'
  },
  'productId': {
    'description': 'The ID of the product.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'product { id }'
  },
  'productTitle': {
    'description': 'The title of the product.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'product { title }'
  },
  'taxable': {
    'description': 'Whether the variant is taxable.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'taxable'
  },
  'taxCode': {
    'description': 'The tax code.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'taxCode'
  },
  'availableForSale': {
    'description': 'Whether the variant is available for sale.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'availableForSale'
  },
  'createdAt': {
    'description': 'The date and time when the variant was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the variant was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
