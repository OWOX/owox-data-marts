/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/DraftOrder

var draftOrdersFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'name': {
    'description': 'The identifier for the draft order, which is unique within the store.',
    'type': 'string',
    'graphqlPath': 'name'
  },
  'status': {
    'description': 'The status of the draft order.',
    'type': 'string',
    'graphqlPath': 'status'
  },
  'email': {
    'description': 'The email address of the customer.',
    'type': 'string',
    'graphqlPath': 'email'
  },
  'phone': {
    'description': 'The phone number assigned to the draft order.',
    'type': 'string',
    'graphqlPath': 'phone'
  },
  'note2': {
    'description': 'The text from an optional note attached to the draft order.',
    'type': 'string',
    'graphqlPath': 'note2'
  },
  'currencyCode': {
    'description': 'The three letter code for the currency of the store.',
    'type': 'string',
    'graphqlPath': 'currencyCode'
  },
  'subtotalPrice': {
    'description': 'The subtotal of the line items and corresponding discounts.',
    'type': 'string',
    'graphqlPath': 'subtotalPriceSet { shopMoney { amount } }'
  },
  'totalPrice': {
    'description': 'The total price of the draft order including taxes, shipping charges, and discounts.',
    'type': 'string',
    'graphqlPath': 'totalPriceSet { shopMoney { amount } }'
  },
  'totalTax': {
    'description': 'The total amount of taxes for the draft order.',
    'type': 'string',
    'graphqlPath': 'totalTaxSet { shopMoney { amount } }'
  },
  'totalShippingPrice': {
    'description': 'The total shipping charge for the draft order.',
    'type': 'string',
    'graphqlPath': 'totalShippingPriceSet { shopMoney { amount } }'
  },
  'totalDiscounts': {
    'description': 'The total discounts for the draft order.',
    'type': 'string',
    'graphqlPath': 'totalDiscountsSet { shopMoney { amount } }'
  },
  'taxExempt': {
    'description': 'Whether the draft order is tax exempt.',
    'type': 'bool',
    'graphqlPath': 'taxExempt'
  },
  'taxesIncluded': {
    'description': 'Whether the line item prices include taxes.',
    'type': 'bool',
    'graphqlPath': 'taxesIncluded'
  },
  'lineItemsQuantity': {
    'description': 'The total number of line items.',
    'type': 'int32',
    'graphqlPath': 'lineItems { nodes { id } }'
  },
  'customerId': {
    'description': 'The ID of the customer who will be sent an invoice for the draft order.',
    'type': 'string',
    'graphqlPath': 'customer { id }'
  },
  'customerEmail': {
    'description': 'The email of the customer.',
    'type': 'string',
    'graphqlPath': 'customer { email }'
  },
  'shippingAddressCity': {
    'description': 'City from the shipping address.',
    'type': 'string',
    'graphqlPath': 'shippingAddress { city }'
  },
  'shippingAddressCountry': {
    'description': 'Country from the shipping address.',
    'type': 'string',
    'graphqlPath': 'shippingAddress { country }'
  },
  'shippingAddressProvince': {
    'description': 'Province from the shipping address.',
    'type': 'string',
    'graphqlPath': 'shippingAddress { province }'
  },
  'shippingAddressZip': {
    'description': 'Postal/ZIP code from the shipping address.',
    'type': 'string',
    'graphqlPath': 'shippingAddress { zip }'
  },
  'billingAddressCity': {
    'description': 'City from the billing address.',
    'type': 'string',
    'graphqlPath': 'billingAddress { city }'
  },
  'billingAddressCountry': {
    'description': 'Country from the billing address.',
    'type': 'string',
    'graphqlPath': 'billingAddress { country }'
  },
  'billingAddressProvince': {
    'description': 'Province from the billing address.',
    'type': 'string',
    'graphqlPath': 'billingAddress { province }'
  },
  'billingAddressZip': {
    'description': 'Postal/ZIP code from the billing address.',
    'type': 'string',
    'graphqlPath': 'billingAddress { zip }'
  },
  'invoiceSentAt': {
    'description': 'The date and time when the invoice was last emailed to the customer.',
    'type': 'datetime',
    'graphqlPath': 'invoiceSentAt'
  },
  'completedAt': {
    'description': 'The date and time when the draft order converted to a new order.',
    'type': 'datetime',
    'graphqlPath': 'completedAt'
  },
  'createdAt': {
    'description': 'The date and time when the draft order was created.',
    'type': 'datetime',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the draft order was last updated.',
    'type': 'datetime',
    'graphqlPath': 'updatedAt'
  }
};
