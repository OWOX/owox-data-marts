/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/InventoryItem

var inventoryItemsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'sku': {
    'description': 'The unique SKU (stock keeping unit) of the inventory item.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'sku'
  },
  'tracked': {
    'description': 'Whether inventory levels are tracked for the item.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'tracked'
  },
  'requiresShipping': {
    'description': 'Whether the item requires shipping.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'requiresShipping'
  },
  'harmonizedSystemCode': {
    'description': 'The harmonized system code of the item.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'harmonizedSystemCode'
  },
  'countryCodeOfOrigin': {
    'description': 'The ISO 3166-1 alpha-2 country code of where the item originated from.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'countryCodeOfOrigin'
  },
  'variantId': {
    'description': 'The ID of the variant associated with this inventory item.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'variant { id }'
  },
  'createdAt': {
    'description': 'The date and time when the inventory item was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the inventory item was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
