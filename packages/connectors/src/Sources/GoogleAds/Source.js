/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GoogleAdsSource = class GoogleAdsSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
      DeveloperToken: {
        isRequired: true,
        requiredType: "string",
        label: "Developer Token",
        description: "Google Ads API Developer Token"
      },
      CustomerId: {
        isRequired: true,
        requiredType: "string", 
        label: "Customer ID",
        description: "Google Ads Customer ID (format: 123-456-7890)"
      },
      ClientID: {
        isRequired: true,
        requiredType: "string",
        label: "Client ID",
        description: "OAuth2 Client ID"
      },
      ClientSecret: {
        isRequired: true,
        requiredType: "string",
        label: "Client Secret",
        description: "OAuth2 Client Secret"
      },
      RefreshToken: {
        isRequired: true,
        requiredType: "string",
        label: "Refresh Token",
        description: "OAuth2 Refresh Token"
      },
      // ServiceAccountKeyFile: {
      //   isRequired: true,
      //   requiredType: "string",
      //   label: "Service Account Key (JSON)",
      //   description: "Google Service Account JSON key file content"
      // },
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
        description: "List of fields to fetch from Google Ads API"
      }
    }));
    
    this.fieldsSchema = GoogleAdsFieldsSchema;
  }

  /**
   * Get access token using OAuth2 refresh token
   */
  getAccessToken() {
    if (this.config.AccessToken?.value) {
      return this.config.AccessToken.value;
    }

    return this._getOAuth2Token();
  }

  /**
   * Get access token using OAuth2 refresh token
   * Based on: https://developers.google.com/identity/protocols/oauth2/web-server#offline
   */
  _getOAuth2Token() {
    try {
      const tokenUrl = "https://oauth2.googleapis.com/token";
      
      const form = {
        grant_type: 'refresh_token',
        client_id: this.config.ClientID.value,
        client_secret: this.config.ClientSecret.value,
        refresh_token: this.config.RefreshToken.value
      };
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        payload: form,
        body: Object.entries(form)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&'),
        muteHttpExceptions: true
      };
      
      const response = this.urlFetchWithRetry(tokenUrl, options);
      const tokenData = JSON.parse(response.getContentText());
      
      if (tokenData.error) {
        throw new Error(`OAuth2 error: ${tokenData.error_description || tokenData.error}`);
      }
      
      this.config.AccessToken = { value: tokenData.access_token };
      
      this.config.logMessage("✅ Successfully authenticated with OAuth2");
      return tokenData.access_token;
      
    } catch (error) {
      this.config.logMessage(`❌ OAuth2 authentication failed: ${error.message}`);
      throw new Error(`OAuth2 authentication failed: ${error.message}`);
    }
  }

  // ============================================================================
  // SERVICE ACCOUNT AUTHENTICATION (COMMENTED OUT - for future use)
  // ============================================================================
  
  // /**
  //  * Get access token using Service Account authentication
  //  */
  // getAccessToken() {
  //   if (this.accessToken && this.tokenExpiryTime && Date.now() < this.tokenExpiryTime) {
  //     return this.accessToken;
  //   }
  //
  //   return this._getServiceAccountToken();
  // }

  // /**
  //  * Get access token using Service Account (Direct Access method)
  //  * Node.js implementation using crypto module for JWT signing
  //  * Based on: https://developers.google.com/google-ads/api/docs/oauth/service-accounts#direct
  //  */
  // _getServiceAccountToken() {
  //   try {
  //     const serviceAccountData = JSON.parse(this.config.ServiceAccountKeyFile.value);
  //     
  //     const now = Math.floor(Date.now() / 1000);
  //     const jwt = this._createJWTForNodeJS({
  //       iss: serviceAccountData.client_email,
  //       scope: "https://www.googleapis.com/auth/adwords",
  //       aud: "https://oauth2.googleapis.com/token",
  //       exp: now + 3600, // 1 година
  //       iat: now
  //     }, serviceAccountData.private_key);
  //     
  //     const tokenUrl = "https://oauth2.googleapis.com/token";
  //     const formData = new URLSearchParams({
  //       grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
  //       assertion: jwt
  //     });
  //     
  //     const options = {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/x-www-form-urlencoded'
  //       },
  //       payload: formData.toString(),
  //       body: formData.toString() // Для Node.js
  //     };
  //     
  //     const response = this.urlFetchWithRetry(tokenUrl, options);
  //     const tokenData = JSON.parse(response.getContentText());
  //     
  //     if (tokenData.error) {
  //       throw new Error(`Service Account auth error: ${tokenData.error_description}`);
  //     }
  //     
  //     this.accessToken = tokenData.access_token;
  //     this.tokenExpiryTime = Date.now() + (tokenData.expires_in - 60) * 1000; // Мінус 1 хвилина для запасу
  //     
  //     this.config.logMessage("✅ Successfully authenticated with Service Account");
  //     return this.accessToken;
  //     
  //   } catch (error) {
  //     this.config.logMessage(`❌ Service Account authentication failed: ${error.message}`);
  //     throw new Error(`Service Account authentication failed: ${error.message}`);
  //   }
  // }

  // /**
  //  * Create JWT token for Node.js using crypto module
  //  * Node.js implementation for Service Account authentication
  //  */
  // _createJWTForNodeJS(payload, privateKey) {
  //   const header = {
  //     alg: "RS256",
  //     typ: "JWT"
  //   };
  //   
  //   // Base64URL encode header and payload
  //   const headerB64 = this._base64URLEncode(JSON.stringify(header));
  //   const payloadB64 = this._base64URLEncode(JSON.stringify(payload));
  //   const signatureInput = `${headerB64}.${payloadB64}`;
  //   
  //   if (typeof require !== 'undefined') {
  //     const crypto = require('crypto');
  //     const signature = crypto.sign('RSA-SHA256', Buffer.from(signatureInput), privateKey);
  //     const signatureB64 = this._base64URLEncode(signature);
  //     return `${headerB64}.${payloadB64}.${signatureB64}`;
  //   } else {
  //     throw new Error("JWT signing not implemented for Apps Script environment. Use OAuth AccessToken instead.");
  //   }
  // }

  // /**
  //  * Base64URL encoding (RFC 4648 Section 5)
  //  */
  // _base64URLEncode(data) {
  //   let base64;
  //   
  //   if (typeof data === 'string') {
  //     if (typeof Buffer !== 'undefined') {
  //       base64 = Buffer.from(data, 'utf8').toString('base64');
  //     } else {
  //       base64 = Utilities.base64Encode(data);
  //     }
  //   } else {
  //     base64 = data.toString('base64');
  //   }
  //   
  //   // Convert base64 to base64url
  //   return base64
  //     .replace(/\+/g, '-')
  //     .replace(/\//g, '_')
  //     .replace(/=/g, '');
  // }

  /**
   * Fetch data from Google Ads API
   * Single entry point for all fetches
   * @param {string} nodeName - Name of the node (campaigns, ad_groups, ads, keywords)
   * @param {string|number} customerId - Google Ads Customer ID
   * @param {Object} options - Fetch options
   * @param {Array<string>} options.fields - Fields to fetch
   * @param {Date} [options.startDate] - Start date for time series data
   * @returns {Array<Object>} - Fetched data
   */
  fetchData(nodeName, customerId, options) {
    const { fields, startDate } = options;
    const query = this._buildQuery({ nodeName, fields, startDate });
    return this.makeRequest({ customerId, query, nodeName, fields });
  }

  /**
   * Convert field names to API field names
   * @param {Array<string>} fields - Field names
   * @param {string} nodeName - Name of the node
   * @returns {Array<string>} - API field names
   * @private
   */
  _getAPIFields(fields, nodeName) {
    return fields.map(fieldName => this.fieldsSchema[nodeName].fields[fieldName].apiName);
  }

  /**
   * Get Google Ads resource name by node name
   * @param {string} nodeName - Name of the node
   * @returns {string} - Resource name for GAQL FROM clause
   * @private
   */
  _getResourceName(nodeName) {
    switch (nodeName) {
      case 'campaign_catalog':
      case 'campaign_stats':
        return 'campaign';
      case 'ad_group_catalog':
      case 'ad_group_stats':
        return 'ad_group';
      case 'ad_group_ad_stats':
        return 'ad_group_ad';
      case 'keyword_stats':
        return 'keyword_view';
      case 'criterion_catalog':
        return 'ad_group_criterion';
      default:
        throw new Error(`Unknown resource name for nodeName: ${nodeName}`);
    }
  }

  /**
   * Build GAQL query based on node type
   * @param {Object} options - Query options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Field names to fetch
   * @param {Date} [options.startDate] - Start date for time series data
   * @returns {string} - GAQL query
   * @private
   */
  _buildQuery({ nodeName, fields, startDate }) {
    const apiFields = this._getAPIFields(fields, nodeName);
    const resourceName = this._getResourceName(nodeName);
    let query = `SELECT ${apiFields.join(', ')} FROM ${resourceName}`;
    
    if (startDate && this.fieldsSchema[nodeName].isTimeSeries) {
      const formattedDate = EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd");
      query += ` WHERE segments.date = '${formattedDate}'`;
    }
    
    return query;
  }

  /**
   * Make a request to Google Ads API with pagination support
   * @param {Object} options - Request options
   * @param {string|number} options.customerId - Google Ads Customer ID
   * @param {string} options.query - GAQL query  
   * @param {string} options.nodeName - Name of the node for field mapping
   * @param {Array<string>} options.fields - Fields that were requested
   * @returns {Array<Object>} - API response data
   */
  makeRequest({ customerId, query, nodeName, fields }) {
    const accessToken = this.getAccessToken();
    const url = `https://googleads.googleapis.com/v21/customers/${customerId.replace(/-/g, '')}/googleAds:search`;
    
    console.log(`Google Ads API Request URL: ${url}`);
    console.log(`GAQL Query: ${query}`);
    
    let allData = [];
    let nextPageToken = null;
    
    do {
      // Note: Google Ads API does not support custom pageSize
      // It always returns pages of 10000 rows maximum
      const requestBody = {
        query: query
      };
      
      if (nextPageToken) {
        requestBody.pageToken = nextPageToken;
      }
      
      const options = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': this.config.DeveloperToken.value,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(requestBody),
        body: JSON.stringify(requestBody),
        muteHttpExceptions: true
      };
      
      const response = this.urlFetchWithRetry(url, options);
      const jsonData = JSON.parse(response.getContentText());
      
      if (jsonData.error) {
        throw new Error(`Google Ads API error: ${jsonData.error.message}`);
      }
      
      if (jsonData.results) {
        const processedResults = jsonData.results.map(result => this._mapResultToColumns(result, nodeName, fields));
        allData = allData.concat(processedResults);
      }
      
      nextPageToken = jsonData.nextPageToken || null;
      console.log(`Fetched ${allData.length} records so far...`);
      
    } while (nextPageToken);
    
    return allData;
  }

  /**
   * Flatten nested API response to snake_case keys
   * {campaign: {id: "123"}} → {"campaign_id": "123"}
   * {adGroup: {baseAdGroup: "456"}} → {"ad_group_base_ad_group": "456"}
   * @param {Object} obj - Nested object
   * @param {string} prefix - Current prefix for recursion
   * @returns {Object} - Flattened object with snake_case keys
   * @private
   */
  _flattenToSnakeCase(obj, prefix = '') {
    const flattened = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      const fullKey = prefix ? `${prefix}_${snakeKey}` : snakeKey;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this._flattenToSnakeCase(value, fullKey));
      } else {
        flattened[fullKey] = value;
      }
    }
    
    return flattened;
  }

  /**
   * Map API result to requested column names
   * @param {Object} result - API response result
   * @param {string} nodeName - Name of the node (unused, kept for consistency)
   * @param {Array<string>} requestedFields - Fields that were requested (e.g. ['ad_group_id', 'campaign_id'])
   * @returns {Object} - Mapped result with column names as keys
   * @private
   */
  _mapResultToColumns(result, nodeName, requestedFields) {
    const flattened = this._flattenToSnakeCase(result);
    const mapped = {};
    
    for (const fieldName of requestedFields) {
      mapped[fieldName] = flattened[fieldName];
    }
    
    return mapped;
  }
};
