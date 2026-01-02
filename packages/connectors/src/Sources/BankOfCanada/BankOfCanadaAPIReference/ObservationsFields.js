/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var observationsFields = {
  'date': {
    'description': 'The date for which the exchange rate was recorded.',
    'type': DATA_TYPES.DATE,
    'GoogleBigQueryPartitioned': true
  },
  'label': {
    'description': 'The currency code (e.g., USD, EUR, GBP).',
    'type': DATA_TYPES.STRING,
  },
  'rate': {
    'description': 'The exchange rate value.',
    'type': DATA_TYPES.NUMBER,
  }
};
