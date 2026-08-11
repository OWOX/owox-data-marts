/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

export class BankOfCanadaSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
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
      },
      CleanUpToKeepWindow: {
        requiredType: 'number',
        label: 'Clean Up To Keep Window',
        description: 'Number of days to keep data before cleaning up',
      },
      Fields: {
        isRequired: true,
        requiredType: 'string',
        label: 'Fields',
        description: 'Comma-separated list of fields to fetch (e.g., date,label,rate)',
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

    this.fieldsSchema = BankOfCanadaFieldsSchema;
  }

  // Bank of Canada `observations/group` endpoint accepts a single date range
  // (start_date / end_date) — fetch the full window in one call.
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.RANGE;
  }

  async fetchData({ nodeName, fields = [], startDate, endDate }) {
    switch (nodeName) {
      case 'observations/group':
        return await this._fetchObservations({ fields, startDate, endDate });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  async _fetchObservations({ fields, startDate, endDate }) {
    const url = `https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?start_date=${startDate}&end_date=${endDate}`;
    this.context.log(LOG_LEVEL.INFO, `Bank of Canada API Request URL: ${url}`);

    const response = await this.urlFetchWithRetry(url, { method: 'GET' });
    const rates = await response.json();

    const data = [];
    rates['observations'].forEach(observation => {
      const { d: date, ...currencies } = observation;

      for (const currency in currencies) {
        data.push({
          date,
          label: currency.substring(2),
          rate: currencies[currency]['v'],
        });
      }
    });

    return this._filterBySchema(data, 'observations/group', fields);
  }

  _filterBySchema(items, nodeName, requestedFields = []) {
    const schema = this.fieldsSchema[nodeName];
    const requiredFields = new Set(schema.requiredFields || []);
    const keepFields = new Set([...requiredFields, ...requestedFields]);

    return items.map(item => {
      const result = {};
      for (const key of Object.keys(item)) {
        if (keepFields.has(key)) {
          result[key] = item[key];
        }
      }
      return result;
    });
  }
}
