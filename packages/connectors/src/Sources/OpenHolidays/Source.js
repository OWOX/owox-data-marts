/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

export class OpenHolidaysSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      countryIsoCode: {
        isRequired: true,
        requiredType: 'string',
        default: 'CH',
        label: 'Country ISO Code',
        description: 'ISO country code for which to fetch holidays (e.g., CH, US, GB)',
      },
      languageIsoCode: {
        isRequired: true,
        requiredType: 'string',
        default: 'EN',
        label: 'Language ISO Code',
        description: 'ISO language code for holiday names (e.g., EN, DE, FR)',
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
      CleanUpToKeepWindow: {
        requiredType: 'number',
        label: 'Clean Up To Keep Window',
        description: 'Number of days to keep data before cleaning up',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      Fields: {
        isRequired: true,
        requiredType: 'string',
        label: 'Fields',
        description: 'List of fields to fetch from Open Holidays API',
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

    this.fieldsSchema = OpenHolidaysFieldsSchema;
  }

  // OpenHolidays API supports a single range query — fetch full window in one call.
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.RANGE;
  }

  async fetchData({ nodeName, fields = [], startDate, endDate }) {
    switch (nodeName) {
      case 'publicHolidays':
        return await this._fetchPublicHolidays({ fields, startDate, endDate });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  async _fetchPublicHolidays({ fields, startDate, endDate }) {
    const countryIsoCode = this.context.getParameter('countryIsoCode')?.value;
    const languageIsoCode = this.context.getParameter('languageIsoCode')?.value;

    const url = `https://openholidaysapi.org/PublicHolidays?countryIsoCode=${countryIsoCode}&languageIsoCode=${languageIsoCode}&validFrom=${startDate}&validTo=${endDate}`;
    this.context.log(LOG_LEVEL.INFO, `OpenHolidays API Request URL: ${url}`);

    const response = await this.urlFetchWithRetry(url, { method: 'GET' });
    const holidays = await response.json();

    if (!holidays || !holidays.length) {
      this.context.log(LOG_LEVEL.INFO, 'No public holidays found for the requested period.');
      return [];
    }

    const rawData = holidays.map(holiday => ({
      id: holiday.id,
      date: holiday.startDate ? new Date(holiday.startDate) : null,
      name: holiday.name?.find(entry => entry.language === languageIsoCode)?.text || 'Unknown',
      type: holiday.type || 'Unknown',
      regionalScope: holiday.regionalScope || 'Unknown',
      temporalScope: holiday.temporalScope || 'Unknown',
      nationwide: holiday.nationwide || false,
    }));

    return this._filterBySchema(rawData, 'publicHolidays', fields);
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
