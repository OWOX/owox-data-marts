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
    'type': 'string',
    'graphqlPath': 'id'
  },
  'firstName': {
    'description': 'The customer first name.',
    'type': 'string',
    'graphqlPath': 'firstName'
  },
  'lastName': {
    'description': 'The customer last name.',
    'type': 'string',
    'graphqlPath': 'lastName'
  },
  'displayName': {
    'description': 'The full name of the customer.',
    'type': 'string',
    'graphqlPath': 'displayName'
  },
  'email': {
    'description': 'The customer email address.',
    'type': 'string',
    'graphqlPath': 'email'
  },
  'phone': {
    'description': 'The customer phone number.',
    'type': 'string',
    'graphqlPath': 'phone'
  },
  'state': {
    'description': 'The state of the customer account.',
    'type': 'string',
    'graphqlPath': 'state'
  },
  'locale': {
    'description': 'The customer locale.',
    'type': 'string',
    'graphqlPath': 'locale'
  },
  'taxExempt': {
    'description': 'Whether the customer is exempt from being charged taxes.',
    'type': 'bool',
    'graphqlPath': 'taxExempt'
  },
  'verifiedEmail': {
    'description': 'Whether the customer has verified their email.',
    'type': 'bool',
    'graphqlPath': 'verifiedEmail'
  },
  'emailMarketingConsentState': {
    'description': 'The current email marketing state for the customer.',
    'type': 'string',
    'graphqlPath': 'emailMarketingConsent { marketingState }'
  },
  'smsMarketingConsentState': {
    'description': 'The current SMS marketing state for the customer.',
    'type': 'string',
    'graphqlPath': 'smsMarketingConsent { marketingState }'
  },
  'numberOfOrders': {
    'description': 'The number of orders associated with this customer.',
    'type': 'int32',
    'graphqlPath': 'numberOfOrders'
  },
  'amountSpent': {
    'description': 'The total amount spent by the customer (JSON string with amount and currencyCode).',
    'type': 'string',
    'graphqlPath': 'amountSpent { amount currencyCode }'
  },
  'tags': {
    'description': 'A comma-separated list of tags associated with the customer.',
    'type': 'string',
    'graphqlPath': 'tags'
  },
  'note': {
    'description': 'A note about the customer.',
    'type': 'string',
    'graphqlPath': 'note'
  },
  'defaultAddressCity': {
    'description': 'City from the default address.',
    'type': 'string',
    'graphqlPath': 'defaultAddress { city }'
  },
  'defaultAddressCountry': {
    'description': 'Country from the default address.',
    'type': 'string',
    'graphqlPath': 'defaultAddress { country }'
  },
  'defaultAddressProvince': {
    'description': 'Province from the default address.',
    'type': 'string',
    'graphqlPath': 'defaultAddress { province }'
  },
  'defaultAddressZip': {
    'description': 'Postal/ZIP code from the default address.',
    'type': 'string',
    'graphqlPath': 'defaultAddress { zip }'
  },
  'createdAt': {
    'description': 'The date and time when the customer was created.',
    'type': 'timestamp',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the customer was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt'
  }
};
