/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Refund

var orderRefundsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'orderId': {
    'description': 'The ID of the order.',
    'type': 'string',
    'graphqlPath': 'order { id }'
  },
  'note': {
    'description': 'The note attached to the refund.',
    'type': 'string',
    'graphqlPath': 'note'
  },
  'totalRefunded': {
    'description': 'The total amount refunded.',
    'type': 'float',
    'graphqlPath': 'totalRefundedSet { shopMoney { amount } }'
  },
  'currencyCode': {
    'description': 'The currency code.',
    'type': 'string',
    'graphqlPath': 'totalRefundedSet { shopMoney { currencyCode } }'
  },
  'createdAt': {
    'description': 'The date and time when the refund was created.',
    'type': 'datetime',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the refund was last updated.',
    'type': 'datetime',
    'graphqlPath': 'updatedAt'
  }
};
