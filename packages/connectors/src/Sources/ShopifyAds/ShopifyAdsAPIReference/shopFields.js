/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-01/objects/Shop

var shopFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': 'string',
    'graphqlPath': 'id'
  },
  'name': {
    'description': 'The name of the shop.',
    'type': 'string',
    'graphqlPath': 'name'
  },
  'email': {
    'description': 'The email address of the shop.',
    'type': 'string',
    'graphqlPath': 'email'
  },
  'myshopifyDomain': {
    'description': 'The myshopify.com domain of the shop.',
    'type': 'string',
    'graphqlPath': 'myshopifyDomain'
  },
  'primaryDomain': {
    'description': 'The primary domain of the shop.',
    'type': 'string',
    'graphqlPath': 'primaryDomain { host }'
  },
  'currencyCode': {
    'description': 'The currency code of the shop.',
    'type': 'string',
    'graphqlPath': 'currencyCode'
  },
  'timezoneAbbreviation': {
    'description': 'The timezone abbreviation.',
    'type': 'string',
    'graphqlPath': 'timezoneAbbreviation'
  },
  'ianaTimezone': {
    'description': 'The IANA timezone.',
    'type': 'string',
    'graphqlPath': 'ianaTimezone'
  },
  'weightUnit': {
    'description': 'The default weight unit.',
    'type': 'string',
    'graphqlPath': 'weightUnit'
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
  'plan': {
    'description': 'The shop plan name.',
    'type': 'string',
    'graphqlPath': 'plan { displayName }'
  },
  'contactEmail': {
    'description': 'The contact email of the shop.',
    'type': 'string',
    'graphqlPath': 'contactEmail'
  },
  'customerAccountsV2': {
    'description': 'The customer accounts version.',
    'type': 'string',
    'graphqlPath': 'customerAccountsV2 { loginRequiredAtCheckout }'
  },
  'taxesIncluded': {
    'description': 'Whether taxes are included in prices.',
    'type': 'bool',
    'graphqlPath': 'taxesIncluded'
  },
  'taxShipping': {
    'description': 'Whether shipping is taxed.',
    'type': 'bool',
    'graphqlPath': 'taxShipping'
  },
  'createdAt': {
    'description': 'The date and time when the shop was created.',
    'type': 'timestamp',
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the shop was last updated.',
    'type': 'timestamp',
    'graphqlPath': 'updatedAt'
  }
};
