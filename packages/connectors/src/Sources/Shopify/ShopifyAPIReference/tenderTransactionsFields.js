/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/TenderTransaction

var tenderTransactionsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'amount': {
    'description': 'The amount of the tender transaction.',
    'type': 'float',
    'graphqlPath': 'amount { amount }'
  },
  'currencyCode': {
    'description': 'The currency code.',
    'type': 'string',
    'graphqlPath': 'amount { currencyCode }'
  },
  'remoteReference': {
    'description': 'The remote gateway reference.',
    'type': 'string',
    'graphqlPath': 'remoteReference'
  },
  'test': {
    'description': 'Whether the transaction is a test transaction.',
    'type': 'bool',
    'graphqlPath': 'test'
  },
  'orderId': {
    'description': 'The ID of the order.',
    'type': 'string',
    'graphqlPath': 'order { id }'
  },
  'processedAt': {
    'description': 'The date and time when the transaction was processed.',
    'type': 'timestamp',
    'graphqlPath': 'processedAt'
  }
};
