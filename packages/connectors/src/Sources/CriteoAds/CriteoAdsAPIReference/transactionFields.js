/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// Note: the transactions report has a fixed schema and returns camelCase keys
// (unlike statistics/placements, which echo back the PascalCase dimension names
// requested). The keys below must match the response keys exactly so that
// _filterBySchema keeps them.
var transactionFields = {
  'transactionId': {
    'description': 'The unique identifier for the transaction.',
    'type': DATA_TYPES.STRING
  },
  'transactionDate': {
    'description': 'The date and time when the transaction occurred (MM/DD/YYYY HH:MM:SS).',
    'type': DATA_TYPES.STRING
  },
  'advertiserId': {
    'description': 'The unique identifier for the advertiser.',
    'type': DATA_TYPES.STRING
  },
  'advertiserName': {
    'description': 'The name of the advertiser.',
    'type': DATA_TYPES.STRING
  },
  'adsetName': {
    'description': 'The name of the adset that drove the transaction.',
    'type': DATA_TYPES.STRING
  },
  'eventType': {
    'description': 'The type of event that triggered the attribution (click or display).',
    'type': DATA_TYPES.STRING
  },
  'eventDate': {
    'description': 'The date and time of the click or view event that drove the transaction (MM/DD/YYYY HH:MM:SS).',
    'type': DATA_TYPES.STRING
  },
  'attributedTransaction': {
    'description': 'Whether the transaction was attributed to a Criteo ad (returned as "True" / "False").',
    'type': DATA_TYPES.STRING
  },
  'currency': {
    'description': 'The currency of the transaction amount.',
    'type': DATA_TYPES.STRING
  },
  'amount': {
    'description': 'The transaction amount (order value).',
    'type': DATA_TYPES.NUMBER
  },
  'crossDeviceTransaction': {
    'description': 'Whether the transaction occurred on a different device from the one where the ad was viewed (returned as "Yes" / "No").',
    'type': DATA_TYPES.STRING
  }
};
