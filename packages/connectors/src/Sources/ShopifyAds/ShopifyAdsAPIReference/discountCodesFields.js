/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/DiscountCodeNode
// Note: DiscountCodeNode.codeDiscount is a union type, fields are extracted from the resolved type

var discountCodesFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'code': {
    'description': 'The discount code string.',
    'type': 'string',
    'graphqlPath': 'codeDiscount { codes }'
  },
  'discountType': {
    'description': 'The type of discount (DiscountCodeBasic, DiscountCodeBxgy, DiscountCodeFreeShipping).',
    'type': 'string',
    'graphqlPath': 'codeDiscount { __typename }'
  },
  'title': {
    'description': 'The title of the discount.',
    'type': 'string',
    'graphqlPath': 'codeDiscount { title }'
  },
  'status': {
    'description': 'The status of the discount.',
    'type': 'string',
    'graphqlPath': 'codeDiscount { status }'
  },
  'startsAt': {
    'description': 'The date and time when the discount becomes active.',
    'type': 'datetime',
    'graphqlPath': 'codeDiscount { startsAt }'
  },
  'endsAt': {
    'description': 'The date and time when the discount expires.',
    'type': 'datetime',
    'graphqlPath': 'codeDiscount { endsAt }'
  },
  'usageLimit': {
    'description': 'The maximum number of times the discount can be used.',
    'type': 'int32',
    'graphqlPath': 'codeDiscount { usageLimit }'
  },
  'appliesOncePerCustomer': {
    'description': 'Whether the discount can only be used once per customer.',
    'type': 'bool',
    'graphqlPath': 'codeDiscount { appliesOncePerCustomer }'
  },
  'asyncUsageCount': {
    'description': 'The number of times the discount has been used.',
    'type': 'int32',
    'graphqlPath': 'codeDiscount { asyncUsageCount }'
  },
  'createdAt': {
    'description': 'The date and time when the discount was created.',
    'type': 'datetime',
    'graphqlPath': 'codeDiscount { createdAt }'
  },
  'updatedAt': {
    'description': 'The date and time when the discount was last updated.',
    'type': 'datetime',
    'graphqlPath': 'codeDiscount { updatedAt }'
  }
};
