/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/InventoryLevel

var inventoryLevelsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'inventoryItemId': {
    'description': 'The ID of the inventory item.',
    'type': 'string',
    'graphqlPath': 'item { id }'
  },
  'locationId': {
    'description': 'The ID of the location.',
    'type': 'string',
    'graphqlPath': 'location { id }'
  },
  'locationName': {
    'description': 'The name of the location.',
    'type': 'string',
    'graphqlPath': 'location { name }'
  },
  'available': {
    'description': 'The available quantity of the item at the location.',
    'type': 'int32',
    'graphqlPath': 'quantities(names: ["available"]) { quantity }'
  },
  'onHand': {
    'description': 'The on-hand quantity of the item at the location.',
    'type': 'int32',
    'graphqlPath': 'quantities(names: ["on_hand"]) { quantity }'
  },
  'committed': {
    'description': 'The committed quantity of the item at the location.',
    'type': 'int32',
    'graphqlPath': 'quantities(names: ["committed"]) { quantity }'
  },
  'incoming': {
    'description': 'The incoming quantity of the item at the location.',
    'type': 'int32',
    'graphqlPath': 'quantities(names: ["incoming"]) { quantity }'
  },
  'updatedAt': {
    'description': 'The date and time when the inventory level was last updated.',
    'type': 'datetime',
    'graphqlPath': 'updatedAt'
  }
};
