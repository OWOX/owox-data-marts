/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API Documentation: https://docs.openexchangerates.org/reference/historical-json

import { AbstractSource } from '../../Core/AbstractSource.js';

export class OpenExchangeRatesSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      AppId: {
        isRequired: true,
        requiredType: 'string',
        label: 'App ID',
        description: 'OpenExchangeRates API App ID',
        errorMessage:
          "You need to add App Id first. Go to Google Sheets Menu ⟩ OWOX ⟩ Manage Credentials'",
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      StartDate: {
        requiredType: 'date',
        label: 'Start Date',
        description: 'Start date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      EndDate: {
        requiredType: 'date',
        label: 'End Date',
        description: 'End date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      ReimportLookbackWindow: {
        requiredType: 'number',
        isRequired: true,
        default: 2,
        label: 'Reimport Lookback Window',
        description: 'Number of days to look back when reimporting data',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      Symbols: {
        requiredType: 'string',
        label: 'Currency Symbols',
        description: 'Comma-separated list of currency codes to fetch (e.g., USD,EUR,GBP)',
      },
      base: {
        // Please note: changing the API `base` currency is available for Developer, Enterprise and Unlimited plan clients
        requiredType: 'string',
        isRequired: true,
        default: 'USD',
        label: 'Base Currency',
        description: 'Base currency for exchange rates (available for Developer+ plans)',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      CreateEmptyTables: {
        requiredType: 'boolean',
        default: true,
        label: 'Create Empty Tables',
        description: 'Create tables with all columns even if no data is returned from API',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
    };

    this.context.registerParameters(this.parameters, PARAMETER_OWNER.SOURCE);

    this.fieldsSchema = OpenExchangeRatesFieldsSchema;
  }

  // Historical endpoint requires a single date — iterate day-by-day.
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.DAY_BY_DAY;
  }

  /**
   * Determines if an OpenExchangeRates API error is valid for retry.
   * Retries transient failures: 5xx server errors and 429 rate limits, so a
   * single flaky day in a day-by-day backfill is retried instead of aborting
   * the entire import (mirrors CriteoAds/RedditAds/Shopify/XAds).
   * @param {HttpRequestException} error - The error to check
   * @returns {boolean} True if the error should trigger a retry, false otherwise
   */
  isValidToRetry(error) {
    // A native network failure (DNS/ECONNRESET/timeout) carries no statusCode
    // -- retry it, matching the sibling connectors (CriteoAds/RedditAds/Shopify
    // /XAds) and AbstractSource's default policy.
    return (
      !error?.statusCode ||
      error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS ||
      error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN
    );
  }

  async fetchData({ nodeName, fields, accountId, startDate, endDate }) {
    // OpenExchangeRates historical API takes one date per call. Under
    // 'day-by-day', AbstractConnector calls fetchData once per day with
    // startDate === endDate, so we use startDate as the requested date.
    const date = startDate;

    const base = this.context.getParameter('base')?.value;
    const appId = this.context.getParameter('AppId')?.value;
    const symbolsParam = this.context.getParameter('Symbols')?.value;

    let symbols = '';
    if (symbolsParam) {
      symbols = '&symbols=' + String(symbolsParam).replace(/[^A-Z,]/g, '');
    }

    const urlWithoutKey = `https://openexchangerates.org/api/historical/${date}.json?base=${base}${symbols}`;
    this.context.log(LOG_LEVEL.INFO, `OpenExchangeRates API URL: ${urlWithoutKey}`);
    this.context.log(LOG_LEVEL.INFO, `Fetching rates for ${date}`);

    const url = `${urlWithoutKey}&app_id=${appId}`;

    const response = await this.urlFetchWithRetry(url, { method: 'GET' });
    const historical = await response.json();

    const data = [];
    for (const currency in historical['rates']) {
      data.push({
        date: new Date(date),
        base,
        currency,
        rate: parseFloat(historical['rates'][currency]),
      });
    }

    return data;
  }
}
