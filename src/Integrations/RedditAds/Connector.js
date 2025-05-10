/**
 * Copyright (c) OWOX, Inc.
 *
 * For full copyright and license information, please view the LICENSE
 * file distributed with this source code.
 */

class RedditConnector extends AbstractConnector {
  
  constructor(config) {
    super(config.mergeParameters({
      AppName: {
        // can be enabled as required
        requiredType: "string",
      },
      AppCode: {
        isRequired: true,
        requiredType: "string",
      },
      ClientId: {
        isRequired: true,
        requiredType: "string",
      },
      ClientSecret: {
        isRequired: true,
        requiredType: "string",
      },
      RedirectUri: {
        isRequired: true,
        requiredType: "string",
      },
      RefreshToken: {
        isRequired: true,
        requiredType: "string",
      },
      AccessToken: {
        // isRequired: true,
        requiredType: "string",
      },
      AccountIDs: { // corrected from "AccoundIDs"
        isRequired: true,
      },
      Fields: {
        isRequired: true,
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
      },
      CleanUpToKeepWindow: {
        requiredType: "number",
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 31,
      }
    }));
    
    this.fieldsSchema = RedditFieldsSchema;
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
      "Authorization": "Basic " + Utilities.base64Encode(clientId + ":" + clientSecret)
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
      muteHttpExceptions: true
    };
  
    try {
      const response = UrlFetchApp.fetch(url, options);
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
   * Sends an HTTP request with error handling for token expiration (401) and rate limits (429).
   *
   * @param {string} url - The URL to fetch.
   * @param {Object} options - The options for the HTTP request.
   * @returns {HTTPResponse} The HTTP response object.
   */
  sendRequest(url, options) {
    let response = UrlFetchApp.fetch(url, options);
    let code = response.getResponseCode();
  
    // Handle unauthorized error (token expired)
    if (code === 401) {
      this.config.logMessage("Access token expired. Refreshing token...");
      const newTokenResponse = this.getRedditAccessToken(
        this.config.ClientId.value,
        this.config.ClientSecret.value,
        this.config.RedirectUri.value,
        this.config.RefreshToken.value
      );
  
      if (newTokenResponse.success) {
        this.config.AccessToken.value = newTokenResponse.accessToken;
        options.headers["Authorization"] = "Bearer " + this.config.AccessToken.value;
        response = UrlFetchApp.fetch(url, options);
        code = response.getResponseCode();
      } else {
        this.config.logMessage("Failed to refresh token: " + newTokenResponse.message);
        throw new Error("Could not refresh Reddit Access Token.");
      }
    }
  
    // Handle rate limit error (429 Too Many Requests)
    if (code === 429) {
      this.config.logMessage("Rate limit exceeded. Retrying...");
      const delays = [5000, 10000, 20000];
      let success = false;
  
      for (let i = 0; i < delays.length; i++) {
        Utilities.sleep(delays[i]);
        this.config.logMessage(`Retry attempt ${i + 1} after ${delays[i] / 1000} seconds...`);
  
        try {
          response = UrlFetchApp.fetch(url, options);
          code = response.getResponseCode();
          if (code !== 429) {
            success = true;
            break;
          }
        } catch (e) {
          this.config.logMessage(`Retry ${i + 1} failed: ${e.message}`);
        }
      }
  
      if (!success) {
        this.config.logMessage("Failed to bypass rate limit after 3 attempts.");
        throw new Error("Rate limit exceeded. Please try again later.");
      }
    }
  
    return response;
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
    Logger.log(`Fetching data from ${nodeName}/${accountId}/${fields} for ${startDate}`);
  
    const baseUrl = 'https://ads-api.reddit.com/api/v3/';
    let formattedDate = startDate ? Utilities.formatDate(startDate, "UTC", "yyyy-MM-dd") : null;
  
    // Base headers for all requests
    let headers = {
      "Accept": "application/json",
      "Authorization": "Bearer " + this.config.AccessToken.value
    };
  
    // Configuration map for endpoints
    const endpointsMap = {
      'ad-account': ({ accountId }) => ({
        url: `ad_accounts/${accountId}`,
        method: 'get'
      }),
      'ad-account-user': () => ({
        url: 'me',
        method: 'get'
      }),
      'ad-group': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/ad_groups?page.size=10`,
        method: 'get'
      }),
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
  
    // Check if the endpoint for the given nodeName is implemented
    if (!(nodeName in endpointsMap)) {
      throw new Error(`Endpoint for ${nodeName} is not implemented yet. Please add your idea at: https://github.com/OWOX/js-data-connectors/discussions/categories/ideas`);
    }
  
    // Get endpoint configuration
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
    }
  
    let allData = [];
    let nextPageURL = finalUrl;
  
    // Loop to handle pagination
    while (nextPageURL) {
      const response = this.sendRequest(nextPageURL, options);
      const jsonData = JSON.parse(response.getContentText());
  
      if ("data" in jsonData) {
        nextPageURL = jsonData.pagination ? jsonData.pagination.next_url : null;
  
        if (jsonData && jsonData.data && jsonData.data.metrics) {
          for (const key in jsonData.data.metrics) {
            jsonData.data.metrics[key] = this.castRecordFields(nodeName, jsonData.data.metrics[key]);
          }
          allData = allData.concat(jsonData.data.metrics);
        } else {
          for (const key in jsonData.data) {
            jsonData.data[key] = this.castRecordFields(nodeName, jsonData.data[key]);
          }
          allData = allData.concat(jsonData.data);
        }
      } else {
        nextPageURL = null;
        for (const key in jsonData) {
          jsonData[key] = this.castRecordFields(nodeName, jsonData[key]);
        }
        allData = allData.concat(jsonData);
      }
    }
  
    return allData;
  }
  
  /**
   * Casts record fields to the types defined in the schema.
   *
   * @param {string} nodeName - The API node name.
   * @param {Object} record - The record object.
   * @returns {Object} The record with casted fields.
   */
  castRecordFields(nodeName, record) {
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
}