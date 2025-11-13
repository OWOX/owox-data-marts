/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

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

      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
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
    const uniqueKeys = this.fieldsSchema.statistics.uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint 'statistics'. Missing fields: ${missingKeys.join(', ')}`);
    }

    await this.getAccessToken();
    
    const requestBody = this._buildStatisticsRequestBody({ accountId, fields, date });
    const response = await this._makeApiRequest(requestBody);
    const text = await response.getContentText();
    const jsonObject = JSON.parse(text);
    
    return this.parseApiResponse({ apiResponse: jsonObject, date, accountId, fields });
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
      currency: "USD", //@TODO currency in interface
      format: "json",
      startDate: date,
      endDate: date,
      metrics: metrics
    };
  }

  /**
   * Make API request to statistics endpoint
   * @param {Object} requestBody - Request body
   * @returns {Object} - HTTP response
   * @private
   */
  async _makeApiRequest(requestBody) {
    const apiVersion = "2025-07";
    const apiUrl = `https://api.criteo.com/${apiVersion}/statistics/report`;
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

    const response = await this.urlFetchWithRetry(apiUrl, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === HTTP_STATUS.OK) {
      return response;
    } else {
      const text = await response.getContentText();
      throw new Error(`API Error (${responseCode}): ${text}`);
    }
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
   * @param {Array<Object>} items
   * @param {string} nodeName
   * @param {Array<string>} requestedFields
   * @returns {Array<Object>}
   */
  _filterBySchema(items, nodeName, requestedFields = []) {
    const schema = this.fieldsSchema[nodeName];
    const requiredFields = new Set(schema.uniqueKeys || []);
    const keepFields = new Set([ ...requiredFields, ...requestedFields ]);

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

  /**
   * Parse API response and add date field
   * @param {Object} options - Parsing options
   * @param {Object} options.apiResponse - API response
   * @param {Date} options.date - Date to add to each row
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Fields to include in the result
   * @returns {Array<Object>} - Parsed and enriched data
   */
  parseApiResponse({ apiResponse, date, accountId, fields }) {
    if (!apiResponse.Rows || !Array.isArray(apiResponse.Rows)) {
      return [];
    }

    return this._filterBySchema(apiResponse.Rows, 'statistics', fields);
  }
}
