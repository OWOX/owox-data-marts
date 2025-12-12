/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/AbandonedCheckout

var abandonedCheckoutsFields = {
  'id': {
    'description': 'A globally-unique ID for the abandoned checkout.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'abandonedCheckoutUrl': {
    'description': 'The URL for the buyer to recover their checkout.',
    'type': 'string',
    'graphqlPath': 'abandonedCheckoutUrl'
  },
  'completedAt': {
    'description': 'The date and time when the checkout was completed.',
    'type': 'timestamp',
    'graphqlPath': 'completedAt'
  },
  'createdAt': {
    'description': 'The date and time when the checkout was created.',
    'type': 'timestamp',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the checkout was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt'
  },
  'defaultCursor': {
    'description': 'A default cursor that returns the single next record, sorted ascending by ID.',
    'type': 'string',
    'graphqlPath': 'defaultCursor'
  },
  'lineItemsQuantity': {
    'description': 'The total number of line items in the checkout.',
    'type': 'int32',
    'graphqlPath': 'lineItemsQuantity'
  },
  'totalPriceSet': {
    'description': 'The total price of the checkout including taxes, discounts, and shipping (MoneyBag as JSON string).',
    'type': 'string',
    'graphqlPath': 'totalPriceSet { shopMoney { amount currencyCode } }'
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
    'description': 'Province or state from the billing address.',
    'type': 'string',
    'graphqlPath': 'billingAddress { province }'
  },
  'billingAddressZip': {
    'description': 'Postal/ZIP code from the billing address.',
    'type': 'string',
    'graphqlPath': 'billingAddress { zip }'
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
    'description': 'Province or state from the shipping address.',
    'type': 'string',
    'graphqlPath': 'shippingAddress { province }'
  },
  'shippingAddressZip': {
    'description': 'Postal/ZIP code from the shipping address.',
    'type': 'string',
    'graphqlPath': 'shippingAddress { zip }'
  },
  'customerId': {
    'description': 'Customer globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'customer { id }'
  },
  'customerFirstName': {
    'description': 'Customer first name.',
    'type': 'string',
    'graphqlPath': 'customer { firstName }'
  },
  'customerLastName': {
    'description': 'Customer last name.',
    'type': 'string',
    'graphqlPath': 'customer { lastName }'
  },
  'customerEmail': {
    'description': 'Customer email address.',
    'type': 'string',
    'graphqlPath': 'customer { email }'
  }
};
