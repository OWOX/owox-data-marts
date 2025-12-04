/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Fulfillment

var fulfillmentsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'name': {
    'description': 'The name of the fulfillment.',
    'type': 'string',
    'graphqlPath': 'name'
  },
  'status': {
    'description': 'The status of the fulfillment.',
    'type': 'string',
    'graphqlPath': 'status'
  },
  'displayStatus': {
    'description': 'A human-readable display status for the fulfillment.',
    'type': 'string',
    'graphqlPath': 'displayStatus'
  },
  'orderId': {
    'description': 'The ID of the order associated with this fulfillment.',
    'type': 'string',
    'graphqlPath': 'order { id }'
  },
  'totalQuantity': {
    'description': 'The total number of items in the fulfillment.',
    'type': 'int32',
    'graphqlPath': 'totalQuantity'
  },
  'locationId': {
    'description': 'The ID of the location from which the order was fulfilled.',
    'type': 'string',
    'graphqlPath': 'location { id }'
  },
  'locationName': {
    'description': 'The name of the fulfillment location.',
    'type': 'string',
    'graphqlPath': 'location { name }'
  },
  'service': {
    'description': 'The name of the fulfillment service.',
    'type': 'string',
    'graphqlPath': 'service { serviceName }'
  },
  'trackingCompany': {
    'description': 'The name of the tracking company.',
    'type': 'string',
    'graphqlPath': 'trackingInfo { company }'
  },
  'trackingNumbers': {
    'description': 'A comma-separated list of tracking numbers.',
    'type': 'string',
    'graphqlPath': 'trackingInfo { number }'
  },
  'trackingUrls': {
    'description': 'A comma-separated list of tracking URLs.',
    'type': 'string',
    'graphqlPath': 'trackingInfo { url }'
  },
  'requiresShipping': {
    'description': 'Whether any of the line items require shipping.',
    'type': 'bool',
    'graphqlPath': 'requiresShipping'
  },
  'inTransitAt': {
    'description': 'The date and time when the fulfillment went into transit.',
    'type': 'datetime',
    'graphqlPath': 'inTransitAt'
  },
  'deliveredAt': {
    'description': 'The date and time when the fulfillment was delivered.',
    'type': 'datetime',
    'graphqlPath': 'deliveredAt'
  },
  'estimatedDeliveryAt': {
    'description': 'The estimated delivery date and time.',
    'type': 'datetime',
    'graphqlPath': 'estimatedDeliveryAt'
  },
  'createdAt': {
    'description': 'The date and time when the fulfillment was created.',
    'type': 'datetime',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the fulfillment was last updated.',
    'type': 'datetime',
    'graphqlPath': 'updatedAt'
  }
};
