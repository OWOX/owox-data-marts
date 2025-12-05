/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Location

var locationsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'name': {
    'description': 'The name of the location.',
    'type': 'string',
    'graphqlPath': 'name'
  },
  'isActive': {
    'description': 'Whether the location is active.',
    'type': 'bool',
    'graphqlPath': 'isActive'
  },
  'isPrimary': {
    'description': 'Whether the location is the primary location.',
    'type': 'bool',
    'graphqlPath': 'isPrimary'
  },
  'isFulfillmentService': {
    'description': 'Whether the location is a fulfillment service location.',
    'type': 'bool',
    'graphqlPath': 'isFulfillmentService'
  },
  'fulfillsOnlineOrders': {
    'description': 'Whether the location can fulfill online orders.',
    'type': 'bool',
    'graphqlPath': 'fulfillsOnlineOrders'
  },
  'hasActiveInventory': {
    'description': 'Whether the location has active inventory.',
    'type': 'bool',
    'graphqlPath': 'hasActiveInventory'
  },
  'shipsInventory': {
    'description': 'Whether the location ships inventory.',
    'type': 'bool',
    'graphqlPath': 'shipsInventory'
  },
  'addressLine1': {
    'description': 'The first line of the address.',
    'type': 'string',
    'graphqlPath': 'address { address1 }'
  },
  'addressLine2': {
    'description': 'The second line of the address.',
    'type': 'string',
    'graphqlPath': 'address { address2 }'
  },
  'city': {
    'description': 'The city of the location.',
    'type': 'string',
    'graphqlPath': 'address { city }'
  },
  'province': {
    'description': 'The province or state of the location.',
    'type': 'string',
    'graphqlPath': 'address { province }'
  },
  'provinceCode': {
    'description': 'The province or state code.',
    'type': 'string',
    'graphqlPath': 'address { provinceCode }'
  },
  'country': {
    'description': 'The country of the location.',
    'type': 'string',
    'graphqlPath': 'address { country }'
  },
  'countryCode': {
    'description': 'The country code of the location.',
    'type': 'string',
    'graphqlPath': 'address { countryCode }'
  },
  'zip': {
    'description': 'The postal or ZIP code.',
    'type': 'string',
    'graphqlPath': 'address { zip }'
  },
  'phone': {
    'description': 'The phone number of the location.',
    'type': 'string',
    'graphqlPath': 'address { phone }'
  },
  'createdAt': {
    'description': 'The date and time when the location was created.',
    'type': 'timestamp',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the location was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt'
  }
};
