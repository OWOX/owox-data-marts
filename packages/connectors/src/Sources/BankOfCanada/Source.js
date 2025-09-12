/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var BankOfCanadaSource = class BankOfCanadaSource extends AbstractSource {

constructor( configRange ) {

  super( configRange.mergeParameters({
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
    MaxFetchingDays: {
      requiredType: "number",
      isRequired: true,
      default: 30,
      label: "Max Fetching Days",
      description: "Maximum number of days to fetch data for"
    },
    Fields: {
      isRequired: true,
      requiredType: "string",
      label: "Fields",
      description: "Comma-separated list of fields to fetch (e.g., date,label,rate)"
    }
  }));

  this.fieldsSchema = BankOfCanadaFieldsSchema;
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
      case 'observations/group':
        return this._fetchObservations({ fields, start_time, end_time });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch observations data from Bank of Canada API
   * @param {Object} opts
   * @param {Array<string>} opts.fields
   * @param {string} opts.start_time
   * @param {string} opts.end_time
   * @returns {Array<Object>}
   */
_fetchObservations({ fields, start_time, end_time }) {
  const rates = this.makeRequest({
    endpoint: `observations/group/FX_RATES_DAILY/json?start_date=${start_time}&end_date=${end_time}`
  });

    let data = [];
    rates["observations"].forEach((observation) => {
      const { d: date, ...currencies } = observation;

      for (const currency in currencies) {
        data.push({
          date,
          label: currency.substring(2),
          rate: currencies[currency]["v"]
        });
      }
    });

    return this._filterBySchema(data, 'observations/group', fields);
  }

  /**
   * Make a request to Bank of Canada API
   * @param {Object} options - Request options
   * @param {string} options.endpoint - API endpoint path (e.g., "observations/group/FX_RATES_DAILY/json")
   * @returns {Object} - API response parsed from JSON
   */
  makeRequest({ endpoint }) {
    const baseUrl = "https://www.bankofcanada.ca/valet/";
    const url = `${baseUrl}${endpoint}`;
    
    console.log(`Bank of Canada API Request URL:`, url);
    
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

}
