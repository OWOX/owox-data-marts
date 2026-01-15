/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/AbandonedCheckout

var abandonedCheckoutsFields = {
  'id': {
    'description': 'A globally-unique ID for the abandoned checkout.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'abandonedCheckoutUrl': {
    'description': 'The URL for the buyer to recover their checkout.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'abandonedCheckoutUrl'
  },
  'completedAt': {
    'description': 'The date and time when the checkout was completed.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'completedAt'
  },
  'createdAt': {
    'description': 'The date and time when the checkout was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the checkout was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  },
  'defaultCursor': {
    'description': 'A default cursor that returns the single next record, sorted ascending by ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'defaultCursor'
  },
  'lineItemsQuantity': {
    'description': 'The total number of line items in the checkout.',
    'type': DATA_TYPES.INTEGER,
    'graphqlPath': 'lineItemsQuantity'
  },
  'totalPriceSet': {
    'description': 'The total price of the checkout including taxes, discounts, and shipping (MoneyBag as JSON string).',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'totalPriceSet { shopMoney { amount currencyCode } }'
  },
  'billingAddressCity': {
    'description': 'City from the billing address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'billingAddress { city }'
  },
  'billingAddressCountry': {
    'description': 'Country from the billing address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'billingAddress { country }'
  },
  'billingAddressProvince': {
    'description': 'Province or state from the billing address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'billingAddress { province }'
  },
  'billingAddressZip': {
    'description': 'Postal/ZIP code from the billing address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'billingAddress { zip }'
  },
  'shippingAddressCity': {
    'description': 'City from the shipping address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'shippingAddress { city }'
  },
  'shippingAddressCountry': {
    'description': 'Country from the shipping address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'shippingAddress { country }'
  },
  'shippingAddressProvince': {
    'description': 'Province or state from the shipping address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'shippingAddress { province }'
  },
  'shippingAddressZip': {
    'description': 'Postal/ZIP code from the shipping address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'shippingAddress { zip }'
  },
  'customerId': {
    'description': 'Customer globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'customer { id }'
  },
  'customerFirstName': {
    'description': 'Customer first name.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'customer { firstName }'
  },
  'customerLastName': {
    'description': 'Customer last name.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'customer { lastName }'
  },
  'customerEmail': {
    'description': 'Customer email address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'customer { email }'
  }
};
