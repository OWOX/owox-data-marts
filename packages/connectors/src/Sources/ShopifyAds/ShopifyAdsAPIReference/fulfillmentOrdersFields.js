/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/FulfillmentOrder

var fulfillmentOrdersFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'status': {
    'description': 'The status of the fulfillment order.',
    'type': 'string',
    'graphqlPath': 'status'
  },
  'requestStatus': {
    'description': 'The request status of the fulfillment order.',
    'type': 'string',
    'graphqlPath': 'requestStatus'
  },
  'orderId': {
    'description': 'The ID of the order associated with this fulfillment order.',
    'type': 'string',
    'graphqlPath': 'order { id }'
  },
  'orderName': {
    'description': 'The name of the order.',
    'type': 'string',
    'graphqlPath': 'order { name }'
  },
  'assignedLocationId': {
    'description': 'The ID of the location assigned to fulfill this order.',
    'type': 'string',
    'graphqlPath': 'assignedLocation { location { id } }'
  },
  'assignedLocationName': {
    'description': 'The name of the assigned location.',
    'type': 'string',
    'graphqlPath': 'assignedLocation { location { name } }'
  },
  'fulfillAt': {
    'description': 'The date and time at which the fulfillment order will be ready to be fulfilled.',
    'type': 'timestamp',
    'graphqlPath': 'fulfillAt'
  },
  'deliveryMethod': {
    'description': 'The delivery method of the fulfillment order.',
    'type': 'string',
    'graphqlPath': 'deliveryMethod { methodType }'
  },
  'createdAt': {
    'description': 'The date and time when the fulfillment order was created.',
    'type': 'timestamp',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the fulfillment order was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt'
  }
};
