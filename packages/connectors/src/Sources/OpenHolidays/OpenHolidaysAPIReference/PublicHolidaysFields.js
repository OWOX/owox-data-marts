/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var publicHolidaysFields = {
  id: {
    'type': DATA_TYPES.STRING,
    'description': "Unique identifier for the holiday"
  },
  date: {
    'type': DATA_TYPES.DATE,
    'description': "Date of the holiday",
    'GoogleBigQueryPartitioned': true
  },
  name: {
    'type': DATA_TYPES.STRING,
    'description': "Name of the holiday in the specified language"
  },
  type: {
    'type': DATA_TYPES.STRING,
    'description': 'Type of holiday (public, school, etc.)'
  },
  regionalScope: {
    'type': DATA_TYPES.STRING,
    'description': 'Regional scope of the holiday'
  },
  temporalScope: {
    'type': DATA_TYPES.STRING,
    'description': 'Temporal scope of the holiday'
  },
  nationwide: {
    'type': DATA_TYPES.BOOLEAN,
    'description': 'Whether the holiday is nationwide'
  }
};
