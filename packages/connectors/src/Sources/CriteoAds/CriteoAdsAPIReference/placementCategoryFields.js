/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var placementCategoryFields = {
  'advertiserId': {
    'description': 'The unique identifier for the advertiser.',
    'type': DATA_TYPES.STRING,
    'fieldType': 'dimension'
  },
  'category': {
    'description': 'The IAB content category of the publisher page where the ad was served.',
    'type': DATA_TYPES.STRING,
    'fieldType': 'dimension'
  },
  'domain': {
    'description': 'The publisher domain where the ad was served.',
    'type': DATA_TYPES.STRING,
    'fieldType': 'dimension'
  },
  'day': {
    'description': 'The day of the placement category data (YYYY-MM-DD format).',
    'type': DATA_TYPES.DATE
  },
  'displays': {
    'description': 'The number of ad impressions served in this category.',
    'type': DATA_TYPES.INTEGER,
    'fieldType': 'metric'
  },
  'clicks': {
    'description': 'The number of clicks in this category.',
    'type': DATA_TYPES.INTEGER,
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
  }
};
