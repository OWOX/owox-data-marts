/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var transactionFields = {
  'TransactionId': {
    'description': 'The unique identifier for the transaction.',
    'type': DATA_TYPES.STRING
  },
  'TransactionDate': {
    'description': 'The date and time when the transaction occurred.',
    'type': DATA_TYPES.STRING
  },
  'AdvertiserId': {
    'description': 'The unique identifier for the advertiser.',
    'type': DATA_TYPES.STRING
  },
  'AdvertiserName': {
    'description': 'The name of the advertiser.',
    'type': DATA_TYPES.STRING
  },
  'AdsetName': {
    'description': 'The name of the adset that drove the transaction.',
    'type': DATA_TYPES.STRING
  },
  'EventType': {
    'description': 'The type of event that triggered the attribution (click or display).',
    'type': DATA_TYPES.STRING
  },
  'EventDate': {
    'description': 'The date and time of the click or view event that drove the transaction.',
    'type': DATA_TYPES.STRING
  },
  'AttributedTransaction': {
    'description': 'Whether the transaction was attributed to a Criteo ad.',
    'type': DATA_TYPES.BOOLEAN
  },
  'Currency': {
    'description': 'The currency of the transaction amount.',
    'type': DATA_TYPES.STRING
  },
  'Amount': {
    'description': 'The transaction amount (order value).',
    'type': DATA_TYPES.NUMBER
  },
  'CrossDeviceTransaction': {
    'description': 'Whether the transaction occurred on a different device from the one where the ad was viewed.',
    'type': DATA_TYPES.BOOLEAN
  }
};
