/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/OrderTransaction

var transactionsFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'kind': {
    'description': 'The kind of transaction.',
    'type': 'string',
    'graphqlPath': 'kind'
  },
  'status': {
    'description': 'The status of the transaction.',
    'type': 'string',
    'graphqlPath': 'status'
  },
  'gateway': {
    'description': 'The payment gateway used.',
    'type': 'string',
    'graphqlPath': 'gateway'
  },
  'paymentMethod': {
    'description': 'The payment method.',
    'type': 'string',
    'graphqlPath': 'paymentMethod'
  },
  'amount': {
    'description': 'The amount of the transaction.',
    'type': 'float',
    'graphqlPath': 'amountSet { shopMoney { amount } }'
  },
  'currencyCode': {
    'description': 'The currency code.',
    'type': 'string',
    'graphqlPath': 'amountSet { shopMoney { currencyCode } }'
  },
  'test': {
    'description': 'Whether the transaction is a test transaction.',
    'type': 'bool',
    'graphqlPath': 'test'
  },
  'errorCode': {
    'description': 'The error code if the transaction failed.',
    'type': 'string',
    'graphqlPath': 'errorCode'
  },
  'orderId': {
    'description': 'The ID of the order.',
    'type': 'string',
    'graphqlPath': 'order { id }'
  },
  'parentTransactionId': {
    'description': 'The ID of the parent transaction.',
    'type': 'string',
    'graphqlPath': 'parentTransaction { id }'
  },
  'authorizationCode': {
    'description': 'The authorization code.',
    'type': 'string',
    'graphqlPath': 'authorizationCode'
  },
  'authorizationExpiresAt': {
    'description': 'The date and time when the authorization expires.',
    'type': 'datetime',
    'graphqlPath': 'authorizationExpiresAt'
  },
  'processedAt': {
    'description': 'The date and time when the transaction was processed.',
    'type': 'datetime',
    'graphqlPath': 'processedAt'
  },
  'createdAt': {
    'description': 'The date and time when the transaction was created.',
    'type': 'datetime',
    'graphqlPath': 'createdAt'
  }
};
