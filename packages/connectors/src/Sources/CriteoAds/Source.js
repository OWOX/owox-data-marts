/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const CRITEO_API_VERSION = "2026-01";
// Source: Criteo v2026.01 Campaign Statistics docs, "Currencies" section.
// Advisory only: membership produces a warning, not an error, because this
// list drifts as Criteo adds currencies — the API is the authority.
const CRITEO_SUPPORTED_CURRENCIES = new Set([
  "EUR", "USD", "GBP", "CHF", "JPY", "BGN", "CZK", "DKK", "HUF", "LTL",
  "PLN", "RON", "SEK", "NOK", "HRK", "RUB", "TRY", "AUD", "BRL", "CAD",
  "CNY", "HKD", "IDR", "INR", "KRW", "MXN", "MYR", "NZD", "PHP", "SGD",
  "THB", "ZAR", "ARS", "COP", "AED", "KZT", "SAR", "UAH", "EGP", "MAD",
  "ILS", "BHD", "JOD", "KWD", "LBP", "OMR", "QAR", "NGN", "KES", "ALL",
  "ETB", "BSD", "BDT", "BAM", "BWP", "MMK", "AFN", "BTN", "GEL", "GHS",
  "GIP", "ISK", "KHR", "JMD", "LAK", "MKD", "MUR", "MNT", "NPR", "NAD",
  "PKR", "RWF", "LKR", "SZL", "TZS", "TTD", "UGX", "ZMW", "BOB", "CRC",
  "DOP", "GTQ", "HNL", "NIO", "PAB", "PYG", "PEN", "UYU", "VEF", "XAF",
  "XOF", "HTG", "MGA", "DZD", "IQD", "LYD", "TND", "YER", "BND", "AOA",
  "MZN", "AMD", "AZN", "KGS", "TJS", "UZS", "MDL", "RSD", "XPF", "MOP",
  "VND", "TWD", "CLP"
]);

var CriteoAdsSource = class CriteoAdsSource extends AbstractSource {

  constructor(configRange) {

    super(configRange.mergeParameters({
      StartDate: {
        requiredType: "date",
        label: "Start Date",
        description: "Start date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      EndDate: {
        requiredType: "date",
        label: "End Date",
        description: "End date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      AdvertiserIDs: {
        isRequired: true,
        label: "Advertiser IDs",
        description: "Criteo Advertiser IDs to fetch data from"
      },
      AccessToken: {
        requiredType: "string",
        label: "Access Token",
        description: "Criteo API Access Token for authentication",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 5,
        label: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      CleanUpToKeepWindow: {
        requiredType: "number",
        label: "Clean Up To Keep Window",
        description: "Number of days to keep data before cleaning up",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      ClientId: {
        isRequired: true,
        requiredType: "string",
        label: "Client ID",
        description: "Your Criteo API Client Id"
      },
      ClientSecret: {
        isRequired: true,
        requiredType: "string",
        label: "Client Secret",
        description: "Your Criteo API Client Secret",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      Currency: {
        requiredType: "string",
        isRequired: true,
        default: "USD",
        label: "Currency",
        description: "ISO 4217 code (e.g. USD, EUR). Supported currencies: https://developers.criteo.com/marketing-solutions/docs/campaign-statistics#currencies"
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      }
    }));

    this.fieldsSchema = CriteoAdsFieldsSchema;
  }

  /**
   * Single entry point for *all* fetches.
   * @param {Object} opts
   * @param {string} opts.nodeName
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @param {Date} opts.date
   * @returns {Array<Object>}
   */
  async fetchData({ nodeName, accountId, fields = [], date }) {
    switch (nodeName) {
      case 'statistics':
        return await this._fetchStatistics({ accountId, fields, date });

      case 'placements':
        return await this._fetchPlacements({ accountId, fields, date });

      case 'placement_categories':
        return await this._fetchPlacementCategories({ accountId, fields, date });

      case 'transactions':
        return await this._fetchTransactions({ accountId, fields, date });

      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Ensure every unique key for a node is among the requested fields, so the API
   * returns them and storage can dedupe correctly. Keys injected after fetch
   * (e.g. 'day' for streams with injectDay) are exempt since they are not requested.
   * @param {string} nodeName
   * @param {Array<string>} fields
   * @throws {Error} when a field is unknown or a required unique key is missing
   * @private
   */
  _validateUniqueKeys(nodeName, fields) {
    const schema = this.fieldsSchema[nodeName];
    const unknownFields = fields.filter(field => !Object.hasOwn(schema.fields, field));
    if (unknownFields.length > 0) {
      throw new Error(`Unknown fields for endpoint '${nodeName}': ${unknownFields.join(', ')}`);
    }

    const uniqueKeys = schema.uniqueKeys || [];
    const injectedKeys = schema.injectDay ? ['day'] : [];
    const missingKeys = uniqueKeys.filter(key => !injectedKeys.includes(key) && !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }
  }

  /**
   * Normalize and validate the configured report currency before it reaches Criteo.
   * Malformed codes fail fast; codes outside the known Criteo list only log a
   * warning, since that list drifts and Criteo rejects unsupported codes with a
   * clear API error anyway.
   * @returns {string} ISO 4217 currency code
   * @throws {Error} when Currency is not a three-letter ISO 4217 code
   * @private
   */
  _getCurrency() {
    if (this._currency) {
      return this._currency;
    }

    const currency = String(this.config.Currency?.value || "USD").trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`Invalid Currency '${currency}'. Expected ISO 4217 code, e.g. USD.`);
    }

    if (!CRITEO_SUPPORTED_CURRENCIES.has(currency)) {
      this.config.logMessage(`Currency '${currency}' is not in the known Criteo-supported list; passing it through. If the API rejects it, pick a supported code, e.g. USD, EUR, JPY.`);
    }

    this._currency = currency;
    return currency;
  }

  /**
   * Fetching statistics data
   * @param {Object} options - Fetching options
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Fields to fetch
   * @param {Date} options.date - Date to fetch data for
   * @returns {Array<Object>} - Parsed and enriched data
   * @private
   */
  async _fetchStatistics({ accountId, fields, date }) {
    this._validateUniqueKeys('statistics', fields);
    await this.getAccessToken();
    const requestBody = this._buildStatisticsRequestBody({ accountId, fields, date });
    const apiUrl = `https://api.criteo.com/${CRITEO_API_VERSION}/statistics/report`;
    const response = await this._makeApiRequest(apiUrl, requestBody);
    const text = await response.getContentText();
    const jsonObject = JSON.parse(text);
    return this.parseApiResponse({ apiResponse: jsonObject, date, fields, nodeName: 'statistics' });
  }

  /**
   * Fetching placement report data
   * @param {Object} options
   * @param {string} options.accountId
   * @param {Array<string>} options.fields
   * @param {Date} options.date
   * @returns {Array<Object>}
   * @private
   */
  async _fetchPlacements({ accountId, fields, date }) {
    this._validateUniqueKeys('placements', fields);
    await this.getAccessToken();
    const requestBody = this._buildPlacementsRequestBody({ nodeName: 'placements', accountId, fields, date });
    const apiUrl = `https://api.criteo.com/${CRITEO_API_VERSION}/placements/report`;
    const response = await this._makeApiRequest(apiUrl, requestBody);
    const text = await response.getContentText();
    const jsonObject = JSON.parse(text);
    return this.parseApiResponse({ apiResponse: jsonObject, date, fields, nodeName: 'placements' });
  }

  /**
   * Fetching placement category report data.
   * Uses the same /placements/report endpoint as the placements stream, with
   * category dimensions: the dedicated categories endpoint does not exist in
   * the 2026-01 OpenAPI spec and returns 404.
   * @param {Object} options
   * @param {string} options.accountId
   * @param {Array<string>} options.fields
   * @param {Date} options.date
   * @returns {Array<Object>}
   * @private
   */
  async _fetchPlacementCategories({ accountId, fields, date }) {
    this._validateUniqueKeys('placement_categories', fields);
    await this.getAccessToken();
    const requestBody = this._buildPlacementsRequestBody({ nodeName: 'placement_categories', accountId, fields, date });
    const apiUrl = `https://api.criteo.com/${CRITEO_API_VERSION}/placements/report`;
    const response = await this._makeApiRequest(apiUrl, requestBody);
    const text = await response.getContentText();
    const jsonObject = JSON.parse(text);
    return this.parseApiResponse({ apiResponse: jsonObject, date, fields, nodeName: 'placement_categories' });
  }

  /**
   * Fetching transaction-level data
   * @param {Object} options
   * @param {string} options.accountId
   * @param {Array<string>} options.fields
   * @param {Date} options.date
   * @returns {Array<Object>}
   * @private
   */
  async _fetchTransactions({ accountId, fields, date }) {
    this._validateUniqueKeys('transactions', fields);
    await this.getAccessToken();
    const formattedDate = DateUtils.formatDate(date);
    const requestBody = {
      data: [{
        type: "Report",
        attributes: {
          advertiserIds: accountId.toString(),
          currency: this._getCurrency(),
          timezone: "UTC",
          format: "json",
          startDate: formattedDate,
          endDate: formattedDate
        }
      }]
    };
    const apiUrl = `https://api.criteo.com/${CRITEO_API_VERSION}/transactions/report`;
    const response = await this._makeApiRequest(apiUrl, requestBody);
    const text = await response.getContentText();
    const jsonObject = JSON.parse(text);
    return this.parseApiResponse({ apiResponse: jsonObject, date, fields, nodeName: 'transactions' });
  }

  /**
   * Build request body for statistics API
   * @param {Object} options - Request parameters
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Fields to fetch
   * @param {Date} options.date - Date to fetch data for
   * @returns {Object} - Request body
   * @private
   */
  _buildStatisticsRequestBody({ accountId, fields, date }) {
    const fieldsSchema = this.fieldsSchema.statistics.fields;
    const formattedDate = DateUtils.formatDate(date);

    // Filter fields into dimensions and metrics based on fieldType
    const dimensions = fields.filter(field =>
      fieldsSchema[field] && fieldsSchema[field].fieldType === 'dimension'
    );
    const metrics = fields.filter(field =>
      fieldsSchema[field] && fieldsSchema[field].fieldType === 'metric'
    );

    return {
      advertiserIds: accountId.toString(),
      timezone: "UTC",
      dimensions: dimensions,
      currency: this._getCurrency(),
      format: "json",
      startDate: formattedDate,
      endDate: formattedDate,
      metrics: metrics
    };
  }

  /**
   * Build JSON:API request body for the placements/report endpoint.
   * Used by both placements and placement_categories streams.
   * @param {Object} options
   * @param {string} options.nodeName - 'placements' or 'placement_categories'
   * @param {string} options.accountId
   * @param {Array<string>} options.fields
   * @param {Date} options.date
   * @returns {Object}
   * @private
   */
  _buildPlacementsRequestBody({ nodeName, accountId, fields, date }) {
    const fieldsSchema = this.fieldsSchema[nodeName].fields;
    const formattedDate = DateUtils.formatDate(date);

    const dimensions = fields
      .filter(f => fieldsSchema[f]?.fieldType === 'dimension')
      .map(f => fieldsSchema[f].apiName || f);
    const metrics = fields.filter(f => fieldsSchema[f]?.fieldType === 'metric');

    return {
      data: [{
        type: "Report",
        attributes: {
          advertiserIds: accountId.toString(),
          currency: this._getCurrency(),
          timezone: "UTC",
          dimensions,
          metrics,
          format: "json",
          disclosed: true,
          startDate: formattedDate,
          endDate: formattedDate
        }
      }]
    };
  }

  /**
   * Make API request to a Criteo endpoint
   * @param {string} url - Full API endpoint URL
   * @param {Object} requestBody - Request body
   * @returns {Object} - HTTP response
   * @private
   */
  async _makeApiRequest(url, requestBody) {
    const options = {
      method: 'post',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        authorization: "Bearer " + this.config.AccessToken.value
      },
      payload: JSON.stringify(requestBody),
      body: JSON.stringify(requestBody) // TODO: body is for Node.js; refactor to centralize JSON option creation
    };

    return await this.urlFetchWithRetry(url, options);
  }

  /**
   * Get access token from API
   * Docs: https://developers.criteo.com/marketing-solutions/docs/authorization-code-setup
   */
  async getAccessToken() {
    if (this.config.AccessToken?.value) {
      return;
    }

    const tokenUrl = 'https://api.criteo.com/oauth2/token';
    const form = {
      grant_type: 'client_credentials',
      client_id: this.config.ClientId.value,
      client_secret: this.config.ClientSecret.value
    };
    const options = {
      method: 'post',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: form,
      body: Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&'), // TODO: body is for Node.js; refactor to centralize JSON option creation
      muteHttpExceptions: true
    };

    try {
      const response = await this.urlFetchWithRetry(tokenUrl, options);
      const text = await response.getContentText();
      const responseData = JSON.parse(text);
      const accessToken = responseData["access_token"];

      this.config.AccessToken = {
        value: accessToken
      };
    } catch (err) {
      console.log(`Error getting access token: ${err}`);
      throw new Error(`Failed to get access token: ${err}`);
    }
  }

  /**
   * Keep only requestedFields plus any schema-required keys.
   * Response keys are matched to canonical schema field names case-insensitively,
   * because Criteo's report responses echo field names in unpredictable casing
   * (e.g. `AdvertiserId`, `adSetId`). This protects unique keys from being dropped
   * — and dedup from silently breaking — when the API casing differs from the schema.
   * @param {Array<Object>} items
   * @param {string} nodeName
   * @param {Array<string>} requestedFields
   * @returns {Array<Object>}
   */
  _filterBySchema(items, nodeName, requestedFields = []) {
    const schema = this.fieldsSchema[nodeName];
    const requiredFields = new Set(schema.uniqueKeys || []);
    const keepFields = new Set([ ...requiredFields, ...requestedFields ]);
    const keyResolver = this._buildKeyResolver(schema);

    return items.map(item => {
      const result = {};
      for (const key of Object.keys(item)) {
        const canonicalKey = keyResolver[key.toLowerCase()] || key;
        // An exact-case canonical key always wins over a differently-cased variant.
        if (keepFields.has(canonicalKey) && (canonicalKey === key || !(canonicalKey in result))) {
          result[canonicalKey] = item[key];
        }
      }
      return result;
    });
  }

  /**
   * Build a case-insensitive map of response keys to canonical schema field names.
   * Includes each canonical field name and any explicitly declared aliases.
   * @param {Object} schema
   * @returns {Object<string, string>} Map of lowercased response key to canonical field name
   * @private
   */
  _buildKeyResolver(schema) {
    const resolver = {};
    for (const [fieldName, fieldConfig] of Object.entries(schema.fields || {})) {
      resolver[fieldName.toLowerCase()] = fieldName;
      for (const alias of fieldConfig.aliases || []) {
        resolver[alias.toLowerCase()] = fieldName;
      }
    }
    return resolver;
  }

  /**
   * Extract the row array from a Criteo report response, handling the known shapes:
   *  - bare array: `[ {...}, ... ]`                         (statistics)
   *  - JSON:API envelope: `{ data: [ { attributes: { rows: [...] } } ] }`
   *                                                          (placements, categories)
   *  - JSON:API per-row entries: `{ data: [ { attributes: { ...row } }, ... ] }`
   *                                                          (transactions: one entry per row)
   *  - legacy envelope: `{ Rows: [...] }`                    (kept for safety)
   * @param {*} apiResponse - Parsed JSON response
   * @returns {Array<Object>|null} Rows, or null when the shape is not recognized
   * @private
   */
  _extractRows(apiResponse) {
    if (Array.isArray(apiResponse)) {
      return apiResponse;
    }
    if (Array.isArray(apiResponse?.Rows)) {
      return apiResponse.Rows;
    }
    if (Array.isArray(apiResponse?.data)) {
      const rows = [];
      let unrecognizedEntries = false;
      for (const entry of apiResponse.data) {
        const attributes = entry?.attributes;
        if (Array.isArray(attributes?.rows)) {
          rows.push(...attributes.rows);
        } else if (attributes && typeof attributes === 'object') {
          // Entry without a rows container: attributes is the row itself.
          rows.push(attributes);
        } else {
          unrecognizedEntries = true;
        }
      }
      // `data` entries exist but none could be interpreted as rows:
      // the envelope shape differs from what we expect — treat as unrecognized.
      if (apiResponse.data.length > 0 && rows.length === 0 && unrecognizedEntries) {
        return null;
      }
      return rows;
    }
    return null;
  }

  /**
   * Describe an API response without logging row values or customer data.
   * @param {*} apiResponse - Parsed JSON response
   * @returns {string}
   * @private
   */
  _describeApiResponseShape(apiResponse) {
    if (Array.isArray(apiResponse)) {
      return `array(length=${apiResponse.length})`;
    }

    if (apiResponse && typeof apiResponse === 'object') {
      const keys = Object.keys(apiResponse);
      const details = keys.map(key => {
        const value = apiResponse[key];
        if (Array.isArray(value)) {
          return `${key}:array(length=${value.length})`;
        }
        if (value && typeof value === 'object') {
          return `${key}:object(keys=${Object.keys(value).join(',')})`;
        }
        return `${key}:${typeof value}`;
      });
      return `object(keys=${keys.join(',')}; ${details.join('; ')})`;
    }

    return String(apiResponse === null ? 'null' : typeof apiResponse);
  }

  /**
   * Parse API response, inject day for streams that need it, and filter by schema.
   * @param {Object} options - Parsing options
   * @param {Object} options.apiResponse - API response
   * @param {Date} options.date - Date to inject if schema has injectDay
   * @param {Array<string>} options.fields - Fields to include in the result
   * @param {string} options.nodeName - Schema node name
   * @returns {Array<Object>} - Parsed and enriched data
   */
  parseApiResponse({ apiResponse, date, fields, nodeName = 'statistics' }) {
    let rows = this._extractRows(apiResponse);

    if (rows === null) {
      const responseShape = this._describeApiResponseShape(apiResponse);
      this.config.logMessage(`Unexpected API response shape for '${nodeName}'; parsed 0 rows. Response shape: ${responseShape}`);
      return [];
    }

    if (this.fieldsSchema[nodeName]?.injectDay) {
      const dayStr = DateUtils.formatDate(date);
      rows = rows.map(row => ({ ...row, day: dayStr }));
    }

    return this._filterBySchema(rows, nodeName, fields);
  }
}
