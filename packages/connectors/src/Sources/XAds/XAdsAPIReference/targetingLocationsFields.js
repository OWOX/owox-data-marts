/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var targetingLocationsFields = {
  'targeting_value': {
    'description': 'Unique hex ID for this location (e.g. 96683cc9126741d1). Use this to join with the country field in stats_by_country.',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'Human-readable location name (e.g. United States, California).',
    'type': DATA_TYPES.STRING
  },
  'location_type': {
    'description': 'Type of location: COUNTRIES, REGIONS, CITIES, METROS, or POSTAL_CODES.',
    'type': DATA_TYPES.STRING
  },
  'country_code': {
    'description': 'ISO 2-letter country code (e.g. US, DE, NL).',
    'type': DATA_TYPES.STRING
  }
};
