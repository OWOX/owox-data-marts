/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var publicHolidaysFields = {
  id: {
    type: "string",
    description: "Unique identifier for the holiday"
  },
  date: {
    type: "date",
    description: "Date of the holiday",
    GoogleBigQueryPartitioned: true
  },
  name: {
    type: "string",
    description: "Name of the holiday in the specified language"
  },
  type: {
    type: "string",
    description: "Type of holiday (public, school, etc.)"
  },
  regionalScope: {
    type: "string",
    description: "Regional scope of the holiday"
  },
  temporalScope: {
    type: "string",
    description: "Temporal scope of the holiday"
  },
  nationwide: {
    type: "boolean",
    description: "Whether the holiday is nationwide"
  }
};
