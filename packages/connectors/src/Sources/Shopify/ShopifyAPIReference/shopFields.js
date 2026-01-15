/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-graphql/2025-10/objects/Shop

var shopFields = {
  'id': {
    'description': 'A globally-unique ID.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'id'
  },
  'name': {
    'description': 'The name of the shop.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'name'
  },
  'email': {
    'description': 'The email address of the shop.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'email'
  },
  'myshopifyDomain': {
    'description': 'The myshopify.com domain of the shop.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'myshopifyDomain'
  },
  'primaryDomain': {
    'description': 'The primary domain of the shop.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'primaryDomain { host }'
  },
  'currencyCode': {
    'description': 'The currency code of the shop.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'currencyCode'
  },
  'timezoneAbbreviation': {
    'description': 'The timezone abbreviation.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'timezoneAbbreviation'
  },
  'ianaTimezone': {
    'description': 'The IANA timezone.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'ianaTimezone'
  },
  'weightUnit': {
    'description': 'The default weight unit.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'weightUnit'
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
    'description': 'Province from the billing address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'billingAddress { province }'
  },
  'billingAddressZip': {
    'description': 'Postal/ZIP code from the billing address.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'billingAddress { zip }'
  },
  'plan': {
    'description': 'The shop plan name.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'plan { displayName }'
  },
  'contactEmail': {
    'description': 'The contact email of the shop.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'contactEmail'
  },
  'customerAccountsV2': {
    'description': 'The customer accounts version.',
    'type': DATA_TYPES.STRING,
    'graphqlPath': 'customerAccountsV2 { loginRequiredAtCheckout }'
  },
  'taxesIncluded': {
    'description': 'Whether taxes are included in prices.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'taxesIncluded'
  },
  'taxShipping': {
    'description': 'Whether shipping is taxed.',
    'type': DATA_TYPES.BOOLEAN,
    'graphqlPath': 'taxShipping'
  },
  'createdAt': {
    'description': 'The date and time when the shop was created.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'createdAt'
  },
  'updatedAt': {
    'description': 'The date and time when the shop was last updated.',
    'type': DATA_TYPES.TIMESTAMP,
    'graphqlPath': 'updatedAt'
  }
};
