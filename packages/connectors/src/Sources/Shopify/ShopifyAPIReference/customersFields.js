/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Customer

var customersFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'firstName': {
    'description': 'The customer first name.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'firstName'
  },
  'lastName': {
    'description': 'The customer last name.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'lastName'
  },
  'displayName': {
    'description': 'The full name of the customer.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'displayName'
  },
  'email': {
    'description': 'The customer email address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'email'
  },
  'phone': {
    'description': 'The customer phone number.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'phone'
  },
  'state': {
    'description': 'The state of the customer account.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'state'
  },
  'locale': {
    'description': 'The customer locale.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'locale'
  },
  'taxExempt': {
    'description': 'Whether the customer is exempt from being charged taxes.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'taxExempt'
  },
  'verifiedEmail': {
    'description': 'Whether the customer has verified their email.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'verifiedEmail'
  },
  'emailMarketingConsentState': {
    'description': 'The current email marketing state for the customer.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'emailMarketingConsent { marketingState }'
  },
  'smsMarketingConsentState': {
    'description': 'The current SMS marketing state for the customer.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'smsMarketingConsent { marketingState }'
  },
  'numberOfOrders': {
    'description': 'The number of orders associated with this customer.',
    'type': DATA_TYPES.INTEGER,
    'graphqlPath': 'numberOfOrders'
  },
  'amountSpent': {
    'description': 'The total amount spent by the customer (JSON string with amount and currencyCode).',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'amountSpent { amount currencyCode }'
  },
  'tags': {
    'description': 'A comma-separated list of tags associated with the customer.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'tags'
  },
  'note': {
    'description': 'A note about the customer.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'note'
  },
  'defaultAddressCity': {
    'description': 'City from the default address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'defaultAddress { city }'
  },
  'defaultAddressCountry': {
    'description': 'Country from the default address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'defaultAddress { country }'
  },
  'defaultAddressProvince': {
    'description': 'Province from the default address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'defaultAddress { province }'
  },
  'defaultAddressZip': {
    'description': 'Postal/ZIP code from the default address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'defaultAddress { zip }'
  },
  'createdAt': {
    'description': 'The date and time when the customer was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the customer was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
