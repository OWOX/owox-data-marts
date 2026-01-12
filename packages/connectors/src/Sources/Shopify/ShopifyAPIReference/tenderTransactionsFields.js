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
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'amount': {
    'description': 'The amount of the tender transaction.',
    'type': DATA_TYPES.NUMBER,
    'graphqlPath': 'amount { amount }'
  },
  'currencyCode': {
    'description': 'The currency code.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'amount { currencyCode }'
  },
  'remoteReference': {
    'description': 'The remote gateway reference.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'remoteReference'
  },
  'test': {
    'description': 'Whether the transaction is a test transaction.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'test'
  },
  'orderId': {
    'description': 'The ID of the order.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'order { id }'
  },
  'processedAt': {
    'description': 'The date and time when the transaction was processed.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'processedAt'
  }
};
