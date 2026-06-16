/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var placementFields = {
  'advertiserId': {
    'description': 'The unique identifier for the advertiser.',
    'type': DATA_TYPES.STRING,
    'fieldType': 'dimension'
  },
  'adsetId': {
    'description': 'The unique identifier for the adset.',
    'type': DATA_TYPES.STRING,
    'fieldType': 'dimension',
    'apiName': 'adSetId'
  },
  'adsetName': {
    'description': 'The name of the adset.',
    'type': DATA_TYPES.STRING,
    'fieldType': 'dimension'
  },
  'environment': {
    'description': 'The environment where the ad was served (Web, Android, iOS).',
    'type': DATA_TYPES.STRING,
    'fieldType': 'dimension'
  },
  'placement': {
    'description': 'The publisher placement where the ad was served.',
    'type': DATA_TYPES.STRING,
    'fieldType': 'dimension'
  },
  'day': {
    'description': 'The day of the placement data (YYYY-MM-DD format).',
    'type': DATA_TYPES.DATE
  },
  'clicks': {
    'description': 'The number of clicks on this placement.',
    'type': DATA_TYPES.INTEGER,
    'fieldType': 'metric'
  },
  'displays': {
    'description': 'The number of ad impressions served on this placement.',
    'type': DATA_TYPES.INTEGER,
    'fieldType': 'metric'
  },
  'cost': {
    'description': 'Total money spent on this placement.',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'salesPc30d': {
    'description': 'The number of transactions or conversions (30-day post-click).',
    'type': DATA_TYPES.INTEGER,
    'fieldType': 'metric'
  },
  'salesPv1d': {
    'description': 'The number of transactions or conversions (1-day post-view).',
    'type': DATA_TYPES.INTEGER,
    'fieldType': 'metric'
  },
  'revenuePc30d': {
    'description': 'The revenue generated (30-day post-click).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'revenuePv1d': {
    'description': 'The revenue generated (1-day post-view).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'cosPc30d': {
    'description': 'The cost of sale (30-day post-click).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'cosPv1d': {
    'description': 'The cost of sale (1-day post-view).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'roasPc30d': {
    'description': 'The return on ad spend (30-day post-click).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'roasPv1d': {
    'description': 'The return on ad spend (1-day post-view).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'cpoPc30d': {
    'description': 'The cost per order (30-day post-click).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'cpoPv1d': {
    'description': 'The cost per order (1-day post-view).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'cvrPc30d': {
    'description': 'The conversion rate (30-day post-click).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  },
  'cvrPv1d': {
    'description': 'The conversion rate (1-day post-view).',
    'type': DATA_TYPES.NUMBER,
    'fieldType': 'metric'
  }
};
