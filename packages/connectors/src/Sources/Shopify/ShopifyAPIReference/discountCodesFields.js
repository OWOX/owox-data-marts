/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/DiscountCodeNode
// Note: codeDiscount is a union type (DiscountCodeBasic | DiscountCodeBxgy | DiscountCodeFreeShipping)

var discountCodesFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'code': {
    'description': 'The discount code string.',
    'type': 'string',
    'graphqlPath': 'codes(first: 1) { nodes { code } }',
    'isUnionField': true
  },
  'discountType': {
    'description': 'The type of discount (DiscountCodeBasic, DiscountCodeBxgy, DiscountCodeFreeShipping).',
    'type': 'string',
    'graphqlPath': '__typename',
    'isUnionField': true
  },
  'title': {
    'description': 'The title of the discount.',
    'type': 'string',
    'graphqlPath': 'title',
    'isUnionField': true
  },
  'status': {
    'description': 'The status of the discount.',
    'type': 'string',
    'graphqlPath': 'status',
    'isUnionField': true
  },
  'startsAt': {
    'description': 'The date and time when the discount becomes active.',
    'type': 'timestamp',
    'graphqlPath': 'startsAt',
    'isUnionField': true
  },
  'endsAt': {
    'description': 'The date and time when the discount expires.',
    'type': 'timestamp',
    'graphqlPath': 'endsAt',
    'isUnionField': true
  },
  'usageLimit': {
    'description': 'The maximum number of times the discount can be used.',
    'type': 'int32',
    'graphqlPath': 'usageLimit',
    'isUnionField': true
  },
  'appliesOncePerCustomer': {
    'description': 'Whether the discount can only be used once per customer.',
    'type': 'bool',
    'graphqlPath': 'appliesOncePerCustomer',
    'isUnionField': true
  },
  'asyncUsageCount': {
    'description': 'The number of times the discount has been used.',
    'type': 'int32',
    'graphqlPath': 'asyncUsageCount',
    'isUnionField': true
  },
  'createdAt': {
    'description': 'The date and time when the discount was created.',
    'type': 'timestamp',
    'graphqlPath': 'createdAt',
    'isUnionField': true
  },
  'updatedAt': {
    'description': 'The date and time when the discount was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt',
    'isUnionField': true
  }
};
