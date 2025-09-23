/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var BankOfCanadaFieldsSchema = {
  "observations/group": {
    overview: "Bank of Canada Exchange Rates",
    description: "Daily foreign exchange rates from Bank of Canada.",
    documentation: "https://www.bankofcanada.ca/valet/docs",
    fields: observationsFields,
    uniqueKeys: ["date", "label"],
    destinationName: "bank_of_canada_exchange_rates",
    isTimeSeries: true
  }
};
