/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Location

var locationsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'name': {
    'description': 'The name of the location.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'name'
  },
  'isActive': {
    'description': 'Whether the location is active.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'isActive'
  },
  'isPrimary': {
    'description': 'Whether the location is the primary location.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'isPrimary'
  },
  'isFulfillmentService': {
    'description': 'Whether the location is a fulfillment service location.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'isFulfillmentService'
  },
  'fulfillsOnlineOrders': {
    'description': 'Whether the location can fulfill online orders.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'fulfillsOnlineOrders'
  },
  'hasActiveInventory': {
    'description': 'Whether the location has active inventory.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'hasActiveInventory'
  },
  'shipsInventory': {
    'description': 'Whether the location ships inventory.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'shipsInventory'
  },
  'addressLine1': {
    'description': 'The first line of the address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { address1 }'
  },
  'addressLine2': {
    'description': 'The second line of the address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { address2 }'
  },
  'city': {
    'description': 'The city of the location.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { city }'
  },
  'province': {
    'description': 'The province or state of the location.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { province }'
  },
  'provinceCode': {
    'description': 'The province or state code.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { provinceCode }'
  },
  'country': {
    'description': 'The country of the location.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { country }'
  },
  'countryCode': {
    'description': 'The country code of the location.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { countryCode }'
  },
  'zip': {
    'description': 'The postal or ZIP code.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { zip }'
  },
  'phone': {
    'description': 'The phone number of the location.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'address { phone }'
  },
  'createdAt': {
    'description': 'The date and time when the location was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the location was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
