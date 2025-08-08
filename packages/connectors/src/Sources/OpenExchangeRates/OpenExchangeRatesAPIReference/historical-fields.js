/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Fields for historical exchange rates data
 * 
 * - date: The date of the exchange rate
 * - base: The base currency code (e.g., USD, EUR)
 * - currency: The target currency code
 * - rate: The exchange rate value
 * 
 * Example record:
 * {
 *   date: "2024-04-11",
 *   base: "USD",
 *   currency: "EUR",
 *   rate: 0.9234
 * }
 */

var historicalFields = {
  date: {
    type: "DATE",
    description: "Date of exchange rate",
    GoogleBigQueryType: "DATE",
    GoogleBigQueryPartitioned: true
  },
  base: {
    type: "STRING",
    description: "Base currency",
    GoogleBigQueryType: "STRING"
  },
  currency: {
    type: "STRING",
    description: "Target currency",
    GoogleBigQueryType: "STRING"
  },
  rate: {
    type: "FLOAT",
    description: "Exchange rate",
    GoogleBigQueryType: "FLOAT64"
  }
};
