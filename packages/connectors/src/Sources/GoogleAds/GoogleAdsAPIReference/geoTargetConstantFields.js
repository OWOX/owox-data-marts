/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var geoTargetConstantFields = {
  'geo_target_constant_id': {
    'description': 'Criterion ID - join key with country_criterion_id in geo_stats',
    'apiName': 'geo_target_constant.id',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'English name of the geo target (e.g. United States, California, New York)',
    'apiName': 'geo_target_constant.name',
    'type': DATA_TYPES.STRING
  },
  'country_code': {
    'description': 'ISO-3166-1 alpha-2 country code (e.g. US, GB, DE)',
    'apiName': 'geo_target_constant.country_code',
    'type': DATA_TYPES.STRING
  },
  'target_type': {
    'description': 'Type of geo target (e.g. Country, Region, City, MetroArea, PostalCode)',
    'apiName': 'geo_target_constant.target_type',
    'type': DATA_TYPES.STRING
  },
  'status': {
    'description': 'Status of the geo target constant (ENABLED or REMOVAL_PLANNED)',
    'apiName': 'geo_target_constant.status',
    'type': DATA_TYPES.STRING
  },
  'canonical_name': {
    'description': 'Fully qualified name including parent targets (e.g. New York,New York,United States)',
    'apiName': 'geo_target_constant.canonical_name',
    'type': DATA_TYPES.STRING
  },
  'parent_geo_target': {
    'description': 'Resource name of the parent geo target constant',
    'apiName': 'geo_target_constant.parent_geo_target',
    'type': DATA_TYPES.STRING
  }
};
