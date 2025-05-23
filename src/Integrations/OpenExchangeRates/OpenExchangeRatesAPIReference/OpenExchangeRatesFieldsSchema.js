/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Schema definition for Open Exchange Rates API
 * 
 * This schema defines the structure of data from different Open Exchange Rates API endpoints.
 * Each endpoint has its own set of fields, unique keys, and documentation.
 * 
 * Endpoints:
 * - historical: Historical exchange rates data
 */

var OpenExchangeRatesFieldsSchema = {
  'historical': {
    overview: "Historical exchange rates data from Open Exchange Rates API",
    description: "Contains historical exchange rates for different currencies relative to a base currency",
    documentation: "https://docs.openexchangerates.org/reference/historical-json",
    fields: {
      bigQuery: bigQueryHistoricalFields
    },
    uniqueKeys: ["date", "base", "currency"]
  }
};
