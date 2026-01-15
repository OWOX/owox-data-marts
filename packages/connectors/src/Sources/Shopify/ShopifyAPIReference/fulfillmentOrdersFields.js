/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/FulfillmentOrder

var fulfillmentOrdersFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'status': {
    'description': 'The status of the fulfillment order.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'status'
  },
  'requestStatus': {
    'description': 'The request status of the fulfillment order.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'requestStatus'
  },
  'orderId': {
    'description': 'The ID of the order associated with this fulfillment order.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'order { id }'
  },
  'orderName': {
    'description': 'The name of the order.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'order { name }'
  },
  'assignedLocationId': {
    'description': 'The ID of the location assigned to fulfill this order.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'assignedLocation { location { id } }'
  },
  'assignedLocationName': {
    'description': 'The name of the assigned location.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'assignedLocation { location { name } }'
  },
  'fulfillAt': {
    'description': 'The date and time at which the fulfillment order will be ready to be fulfilled.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'fulfillAt'
  },
  'deliveryMethod': {
    'description': 'The delivery method of the fulfillment order.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'deliveryMethod { methodType }'
  },
  'createdAt': {
    'description': 'The date and time when the fulfillment order was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the fulfillment order was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
