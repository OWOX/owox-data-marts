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
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'code': {
    'description': 'The discount code string.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'codes(first: 1) { nodes { code } }',
    'isUnionField': true
  },
  'discountType': {
    'description': 'The type of discount (DiscountCodeBasic, DiscountCodeBxgy, DiscountCodeFreeShipping).',
    'type': DATA_TYPES.STRING,
    'graphqlPath': '__typename',
    'isUnionField': true
  },
  'title': {
    'description': 'The title of the discount.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'title',
    'isUnionField': true
  },
  'status': {
    'description': 'The status of the discount.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'status',
    'isUnionField': true
  },
  'startsAt': {
    'description': 'The date and time when the discount becomes active.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'startsAt',
    'isUnionField': true
  },
  'endsAt': {
    'description': 'The date and time when the discount expires.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'endsAt',
    'isUnionField': true
  },
  'usageLimit': {
    'description': 'The maximum number of times the discount can be used.',
    'type': DATA_TYPES.INTEGER,
    'graphqlPath': 'usageLimit',
    'isUnionField': true
  },
  'appliesOncePerCustomer': {
    'description': 'Whether the discount can only be used once per customer.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'appliesOncePerCustomer',
    'isUnionField': true
  },
  'asyncUsageCount': {
    'description': 'The number of times the discount has been used.',
    'type': DATA_TYPES.INTEGER,
    'graphqlPath': 'asyncUsageCount',
    'isUnionField': true
  },
  'createdAt': {
    'description': 'The date and time when the discount was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt',
    'isUnionField': true
  },
  'updatedAt': {
    'description': 'The date and time when the discount was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt',
    'isUnionField': true
  }
};
