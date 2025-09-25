/**
 * Copyright (c) OWOX, Inc.
 *
 * For full copyright and license information, please view the LICENSE
 * file distributed with this source code.
 */

var RedditAdsSource = class RedditAdsSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
      ClientId: {
        isRequired: true,
        requiredType: "string",
        label: "Client ID",
        description: "Reddit Ads API Client ID"
      },
      ClientSecret: {
        isRequired: true,
        requiredType: "string",
        label: "Client Secret",
        description: "Reddit Ads API Client Secret"
      },
      RedirectUri: {
        isRequired: true,
        requiredType: "string",
        label: "Redirect URI",
        description: "Reddit Ads API Redirect URI for OAuth"
      },
      RefreshToken: {
        isRequired: true,
        requiredType: "string",
        label: "Refresh Token",
        description: "Reddit Ads API Refresh Token"
      },
      UserAgent: {
        isRequired: true,
        requiredType: "string",
        label: "User Agent",
        description: "User Agent string for Reddit API requests"
      },
      AccessToken: {
        requiredType: "string",
        label: "Access Token",
        description: "Reddit Ads API Access Token (auto-generated)"
      },
      AccountIDs: {
        isRequired: true,
        label: "Account IDs",
        description: "Reddit Ads Account IDs to fetch data from"
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
      Fields: {
        isRequired: true,
        label: "Fields",
        description: "List of fields to fetch from Reddit API"
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
        default: 31,
        label: "Max Fetching Days",
        description: "Maximum number of days to fetch data for"
      }
    }));

    this.fieldsSchema = RedditFieldsSchema;
  }

  /**
   * Fetches data from the Reddit API.
   *
   * @param {string} nodeName - The API node name.
   * @param {string} accountId - The account ID.
   * @param {Array} fields - Fields to retrieve.
   * @param {Date|null} startDate - The start date for data fetching.
   * @returns {Array} An array of data records.
   */
  fetchData(nodeName, accountId, fields, startDate = null) {
    console.log(`Fetching data from ${nodeName}/${accountId} for ${startDate}`);
    
    // Validate that all required unique keys are present in requested fields
    const uniqueKeys = this.fieldsSchema[nodeName]?.uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }

    // Refresh access token before making requests
    const tokenResponse = this.getRedditAccessToken(
      this.config.ClientId.value,
      this.config.ClientSecret.value,
      this.config.RedirectUri.value,
      this.config.RefreshToken.value
    );

    if (tokenResponse.success) {
      this.config.AccessToken.value = tokenResponse.accessToken;
    }

    const baseUrl = 'https://ads-api.reddit.com/api/v3/';
    let formattedDate = startDate ? EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd") : null;

    // Base headers for all requests
    let headers = {
      "Accept": "application/json",
      "User-Agent": this.config.UserAgent.value,
      "Authorization": "Bearer " + this.config.AccessToken.value
    };

    // Get endpoint configuration
    const endpointsMap = this.getEndpointsMap(); 
    const endpointConfig = endpointsMap[nodeName]({ accountId, formattedDate, fields });
    const finalUrl = baseUrl + endpointConfig.url;
    const reqMethod = endpointConfig.method || 'get';

    // Extend headers if endpoint requires additional headers
    if (endpointConfig.headersExtension) {
      headers = { ...headers, ...endpointConfig.headersExtension };
    }

    // Prepare options for the request
    let options = {
      method: reqMethod,
      headers: headers,
      muteHttpExceptions: true
    };

    if (reqMethod.toLowerCase() === 'post' && endpointConfig.payload) {
      options.payload = JSON.stringify(endpointConfig.payload);
      options.body = JSON.stringify(endpointConfig.payload); // TODO: body is for Node.js; refactor to centralize JSON option creation
    }

    let allData = [];
    let nextPageURL = finalUrl;

    // Loop to handle pagination
    while (nextPageURL) {
      try {
        const response = this.urlFetchWithRetry(nextPageURL, options);
        const jsonData = JSON.parse(response.getContentText());

        if ("data" in jsonData) {
          nextPageURL = jsonData.pagination ? jsonData.pagination.next_url : null;

          if (jsonData && jsonData.data && jsonData.data.metrics) {
            const processedMetrics = this.processMetricsData(nodeName, jsonData.data.metrics, fields);
            allData = allData.concat(processedMetrics);
          } else {
            const processedData = this.processRegularData(nodeName, jsonData.data, fields);
            allData = allData.concat(processedData);
          }
        } else {
          nextPageURL = null;
          const processedRootData = this.processRootData(nodeName, jsonData, fields);
          allData = allData.concat(processedRootData);
        }
      } catch (error) {
        // Handle token refresh for 401 errors
        if (error.statusCode === HTTP_STATUS.UNAUTHORIZED) {
          const newTokenResponse = this.getRedditAccessToken(
            this.config.ClientId.value,
            this.config.ClientSecret.value,
            this.config.RedirectUri.value,
            this.config.RefreshToken.value
          );

          if (newTokenResponse.success) {
            this.config.AccessToken.value = newTokenResponse.accessToken;
            options.headers["Authorization"] = "Bearer " + this.config.AccessToken.value;
            continue; // Retry the request
          }
        }
        throw error;
      }
    }

    console.log(`Successfully fetched ${allData.length} records for ${nodeName}`);
    return allData;
  }

  /**
   * Retrieves a new Reddit access token using the refresh token.
   *
   * @param {string} clientId - The client ID.
   * @param {string} clientSecret - The client secret.
   * @param {string} redirectUri - The redirect URI.
   * @param {string} refreshToken - The refresh token.
   * @returns {Object} An object with a success flag and either the access token or an error message.
   */
  getRedditAccessToken(clientId, clientSecret, redirectUri, refreshToken) {
    const url = "https://www.reddit.com/api/v1/access_token";
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": this.config.UserAgent.value,
      "Authorization": "Basic " + EnvironmentAdapter.base64Encode(clientId + ":" + clientSecret)
    };
    const payload = {
      "grant_type": "refresh_token",
      "redirect_uri": redirectUri,
      "refresh_token": refreshToken
    };
    const options = {
      method: "post",
      headers: headers,
      payload: payload,
      body: Object.entries(payload)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&'), // TODO: body is for Node.js; refactor to centralize JSON option creation
      muteHttpExceptions: true
    };

    try {
      const response = EnvironmentAdapter.fetch(url, options);
      const result = response.getContentText();
      const json = JSON.parse(result);

      if (json.error) {
        return { success: false, message: json.error };
      }

      return { success: true, accessToken: json.access_token };
    } catch (e) {
      return { success: false, message: "Request failed: " + e.toString() };
    }
  }

  /**
   * Returns configuration map for different API endpoints
   *
   * @returns {Object} The endpoints configuration map
   */
  getEndpointsMap() {
    return {
      'ad-account': ({ accountId }) => ({
        url: `ad_accounts/${accountId}`,
        method: 'get'
      }),
      'ad-account-user': () => ({
        url: 'me',
        method: 'get'
      }),
      'ad-group': ({ accountId }) => {
        return {
          url: `ad_accounts/${accountId}/ad_groups?page.size=${this.fieldsSchema['ad-group'].parameters.pageSize.default}`,
          method: 'get'
        };
      },
      'ads': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/ads`,
        method: 'get'
      }),
      'campaigns': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/campaigns`,
        method: 'get'
      }),
      'user-custom-audience': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/custom_audiences`,
        method: 'get'
      }),
      'funding-instruments': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/funding_instruments`,
        method: 'get'
      }),
      'lead-gen-form': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/lead_gen_forms`,
        method: 'get'
      }),
      'report': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-COUNTRY': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "country"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-AD_GROUP_ID': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "ad_group_id"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-CAMPAIGN_ID': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "campaign_id"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-DMA': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "dma"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-INTEREST': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "interest"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-KEYWORD': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "keyword"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-PLACEMENT': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "placement"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-AD_ACCOUNT_ID': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "AD_ACCOUNT_ID"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      }),
      'report-by-COMMUNITY': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'post',
        payload: {
          data: {
            breakdowns: ["date", "ad_id", "community"],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: "GMT"
          }
        },
        headersExtension: {
          "Content-Type": "application/json"
        }
      })
    };
  }

  /**
   * Processes metrics data from reports endpoints
   *
   * @param {string} nodeName - The API node name
   * @param {Array} metrics - The metrics array to process
   * @returns {Array} Processed metrics array
   */
  processMetricsData(nodeName, metrics, fields = []) {
    for (const key in metrics) {
      const record = metrics[key];
      if (record !== undefined && record !== null) {
        metrics[key] = this.castRecordFields(nodeName, record);
      }
    }
    return this._filterBySchema(metrics, nodeName, fields);
  }

  /**
   * Processes regular data array from standard endpoints
   *
   * @param {string} nodeName - The API node name
   * @param {Array} data - The data array to process
   * @returns {Array} Processed data array
   */
  processRegularData(nodeName, data, fields = []) {
    for (const key in data) {
      const record = data[key];
      if (record !== undefined && record !== null) {
        data[key] = this.castRecordFields(nodeName, record);
      }
    }
    return this._filterBySchema(data, nodeName, fields);
  }

  /**
   * Processes root level JSON data
   *
   * @param {string} nodeName - The API node name
   * @param {Object} jsonData - The JSON data to process
   * @returns {Array} Processed data array
   */
  processRootData(nodeName, jsonData, fields = []) {
    const processedData = [];
    for (const key in jsonData) {
      const record = jsonData[key];
      if (record !== undefined && record !== null) {
        processedData.push(this.castRecordFields(nodeName, record));
      }
    }
    return this._filterBySchema(processedData, nodeName, fields);
  }

  /**
   * Casts record fields to the types defined in the schema.
   *
   * @param {string} nodeName - The API node name.
   * @param {Object} record - The record object.
   * @returns {Object} The record with casted fields.
   */
  castRecordFields(nodeName, record) {
    if (!record || typeof record !== 'object') {
      return record;
    }

    if (!this.fieldsSchema || !this.fieldsSchema[nodeName] || !this.fieldsSchema[nodeName]["fields"]) {
      return record;
    }

    for (const field in record) {
      if (field in this.fieldsSchema[nodeName]["fields"] &&
        "type" in this.fieldsSchema[nodeName]["fields"][field]) {
        const type = this.fieldsSchema[nodeName]["fields"][field]["type"];
        switch (true) {
          case type === 'string' && field.startsWith("date_"):
            record[field] = new Date(record[field] + "T00:00:00Z");
            break;
          case type === 'numeric string' && (field.endsWith("_id") || field === "id"):
            record[field] = String(record[field]);
            break;
          case type === 'numeric string' && field.endsWith("spend"):
            record[field] = parseFloat(record[field]);
            break;
          case type === 'numeric string':
            record[field] = parseInt(record[field]);
            break;
          case type === 'unsigned int32':
            record[field] = parseInt(record[field]);
            break;
          case type === 'float':
            record[field] = parseFloat(record[field]);
            break;
          case type === 'bool':
            record[field] = Boolean(record[field]);
            break;
          case type === 'datetime':
            record[field] = new Date(record[field]);
            break;
          case type === 'int32':
            record[field] = parseInt(record[field]);
            break;
        }
      }
    }
    return record;
  }

  /**
   * Determines if a Reddit Ads API error is valid for retry
   * Based on Reddit API error codes and HTTP status codes
   * 
   * @param {HttpRequestException} error - The error to check
   * @return {boolean} True if the error should trigger a retry, false otherwise
   */
  isValidToRetry(error) {
    console.log(`isValidToRetry() called`);
    console.log(`error.statusCode = ${error.statusCode}`);

    // Retry on server errors (5xx)
    if (error.statusCode && error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
      return true;
    }

    // Retry on rate limits (429)
    if (error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
      return true;
    }

    // Retry on unauthorized errors (401) - token might need refreshing
    if (error.statusCode === HTTP_STATUS.UNAUTHORIZED) {
      return true;
    }

    // Retry on network errors or timeouts
    if (!error.statusCode) {
      return true;
    }

    return false;
  }

  /**
   * Returns credential fields for this source
   */
  getCredentialFields() {
    return {
      ClientId: this.config.ClientId,
      ClientSecret: this.config.ClientSecret,
      RedirectUri: this.config.RedirectUri,
      RefreshToken: this.config.RefreshToken,
      UserAgent: this.config.UserAgent
    };
  }

  /**
   * Keep only requestedFields plus any schema-required keys.
   * @param {Array<Object>|Object} items - Array of objects or single object
   * @param {string} nodeName
   * @param {Array<string>} requestedFields
   * @returns {Array<Object>|Object} - Returns same format as input (array or single object)
   */
  _filterBySchema(items, nodeName, requestedFields = []) {
    const schema = this.fieldsSchema[nodeName];
    if (!schema) {
      return items;
    }

    const requiredFields = new Set(schema.uniqueKeys || []);
    const keepFields = new Set([...requiredFields, ...requestedFields]);

    if (Array.isArray(items)) {
      return items.map(item => this._filterSingleItem(item, keepFields));
    } else {
      return this._filterSingleItem(items, keepFields);
    }
  }

  /**
   * Filters a single item by keeping only specified fields
   * @param {Object} item - Single item to filter
   * @param {Set<string>} keepFields - Set of field names to keep
   * @returns {Object} - Filtered item
   */
  _filterSingleItem(item, keepFields) {
    const result = {};
    for (const key of Object.keys(item)) {
      if (keepFields.has(key)) {
        result[key] = item[key];
      }
    }
    return result;
  }
};
