/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var OpenHolidaysSource = class OpenHolidaysSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
      countryIsoCode: {
        isRequired: true,
        requiredType: "string",
        default: "CH",
        label: "Country ISO Code",
        description: "ISO country code for which to fetch holidays (e.g., CH, US, GB)"
      },
      languageIsoCode: {
        isRequired: true,
        requiredType: "string",
        default: "EN",
        label: "Language ISO Code",
        description: "ISO language code for holiday names (e.g., EN, DE, FR)"
      },
      StartDate: {
        requiredType: "date",
        label: "Start Date",
        description: "Start date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL]
      },
      EndDate: {
        requiredType: "date",
        label: "End Date",
        description: "End date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        label: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data"
      },
      CleanUpToKeepWindow: {
        requiredType: "number",
        label: "Clean Up To Keep Window",
        description: "Number of days to keep data before cleaning up"
      },
      Fields: {
        isRequired: true,
        requiredType: "string",
        label: "Fields",
        description: "List of fields to fetch from Open Holidays API"
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API"
      }
    }));
    
    this.fieldsSchema = OpenHolidaysFieldsSchema;
  }

  /**
   * Single entry point for *all* fetches.
   * @param {Object} opts
   * @param {string} opts.nodeName
   * @param {Array<string>} opts.fields
   * @param {string} [opts.start_time]
   * @param {string} [opts.end_time]
   * @returns {Array<Object>}
   */
  fetchData({ nodeName, fields = [], start_time, end_time }) {
    switch (nodeName) {
      case 'publicHolidays':
        return this._fetchPublicHolidays({ fields, start_time, end_time });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch public holidays data
   * @param {Object} options - Fetch options
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {string} options.start_time - Start date for data fetch (YYYY-MM-DD format)
   * @param {string} options.end_time - End date for data fetch (YYYY-MM-DD format)
   * @returns {Array} Array of holiday data
   */
  _fetchPublicHolidays({ fields, start_time, end_time }) {
    let countryIsoCode = this.config.countryIsoCode.value;
    let languageIsoCode = this.config.languageIsoCode.value;

    const holidays = this.makeRequest({
      endpoint: `PublicHolidays?countryIsoCode=${countryIsoCode}&languageIsoCode=${languageIsoCode}&validFrom=${start_time}&validTo=${end_time}`
    });

    if (!holidays || !holidays.length) {
      this.config.logMessage("No public holidays found for the requested period.");
      return [];
    }

    const rawData = holidays.map(holiday => ({
      id: holiday.id,
      date: holiday.startDate ? new Date(holiday.startDate) : null,
      name: holiday.name?.find(entry => entry.language === languageIsoCode)?.text || "Unknown",
      type: holiday.type || "Unknown",
      regionalScope: holiday.regionalScope || "Unknown",
      temporalScope: holiday.temporalScope || "Unknown",
      nationwide: holiday.nationwide || false
    }));

    return this._filterBySchema(rawData, 'publicHolidays', fields);
  }

  /**
   * Make a request to OpenHolidays API
   * @param {Object} options - Request options
   * @param {string} options.endpoint - API endpoint path (e.g., "PublicHolidays?countryIsoCode=CH&...")
   * @returns {Object} - API response parsed from JSON
   */
  makeRequest({ endpoint }) {
    const baseUrl = "https://openholidaysapi.org/";
    const url = `${baseUrl}${endpoint}`;
    
    console.log(`OpenHolidays API Request URL:`, url);
    
    const response = EnvironmentAdapter.fetch(url, {'method': 'get', 'muteHttpExceptions': true});
    const result = JSON.parse(response.getContentText());

    return result;
  }

  /**
   * Keep only requestedFields plus any schema-required keys.
   * @param {Array<Object>} items
   * @param {string} nodeName
   * @param {Array<string>} requestedFields
   * @returns {Array<Object>}
   */
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

};
