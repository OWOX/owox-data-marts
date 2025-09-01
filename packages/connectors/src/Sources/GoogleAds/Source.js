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
      ServiceAccountKeyFile: {
        isRequired: true,
        requiredType: "string",
        label: "Service Account Key (JSON)",
        description: "Google Service Account JSON key file content"
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
        description: "List of fields to fetch from Google Ads API"
      }
    }));
    
    this.fieldsSchema = GoogleAdsFieldsSchema;
    this.accessToken = null;
    this.tokenExpiryTime = null;
  }

  /**
   * Get access token using Service Account authentication
   */
  getAccessToken() {
    // Перевіряємо чи є валідний токен
    if (this.accessToken && this.tokenExpiryTime && Date.now() < this.tokenExpiryTime) {
      return this.accessToken;
    }

    // Отримуємо новий токен через Service Account
    return this._getServiceAccountToken();
  }

  /**
   * Get access token using Service Account (Direct Access method)
   * Node.js implementation using crypto module for JWT signing
   * Based on: https://developers.google.com/google-ads/api/docs/oauth/service-accounts#direct
   */
  _getServiceAccountToken() {
    try {
      const serviceAccountData = JSON.parse(this.config.ServiceAccountKeyFile.value);
      
      // Створюємо JWT для Service Account авторизації
      const now = Math.floor(Date.now() / 1000);
      const jwt = this._createJWTForNodeJS({
        iss: serviceAccountData.client_email,
        scope: "https://www.googleapis.com/auth/adwords",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600, // 1 година
        iat: now
      }, serviceAccountData.private_key);
      
      // Обмінюємо JWT на access token
      const tokenUrl = "https://oauth2.googleapis.com/token";
      const formData = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      });
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        payload: formData.toString(),
        body: formData.toString() // Для Node.js
      };
      
      const response = this.urlFetchWithRetry(tokenUrl, options);
      const tokenData = JSON.parse(response.getContentText());
      
      if (tokenData.error) {
        throw new Error(`Service Account auth error: ${tokenData.error_description}`);
      }
      
      // Зберігаємо токен та час його закінчення
      this.accessToken = tokenData.access_token;
      this.tokenExpiryTime = Date.now() + (tokenData.expires_in - 60) * 1000; // Мінус 1 хвилина для запасу
      
      this.config.logMessage("✅ Successfully authenticated with Service Account");
      return this.accessToken;
      
    } catch (error) {
      this.config.logMessage(`❌ Service Account authentication failed: ${error.message}`);
      throw new Error(`Service Account authentication failed: ${error.message}`);
    }
  }

  /**
   * Create JWT token for Node.js using crypto module
   * Node.js implementation for Service Account authentication
   */
  _createJWTForNodeJS(payload, privateKey) {
    // JWT Header
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
    
    // Base64URL encode header and payload
    const headerB64 = this._base64URLEncode(JSON.stringify(header));
    const payloadB64 = this._base64URLEncode(JSON.stringify(payload));
    const signatureInput = `${headerB64}.${payloadB64}`;
    
    // Sign using Node.js crypto (for Node.js environment)
    if (typeof require !== 'undefined') {
      // Node.js environment
      const crypto = require('crypto');
      const signature = crypto.sign('RSA-SHA256', Buffer.from(signatureInput), privateKey);
      const signatureB64 = this._base64URLEncode(signature);
      return `${headerB64}.${payloadB64}.${signatureB64}`;
    } else {
      // Apps Script environment fallback
      throw new Error("JWT signing not implemented for Apps Script environment. Use OAuth AccessToken instead.");
    }
  }

  /**
   * Base64URL encoding (RFC 4648 Section 5)
   */
  _base64URLEncode(data) {
    let base64;
    
    if (typeof data === 'string') {
      // For string data
      if (typeof Buffer !== 'undefined') {
        // Node.js
        base64 = Buffer.from(data, 'utf8').toString('base64');
      } else {
        // Apps Script
        base64 = Utilities.base64Encode(data);
      }
    } else {
      // For Buffer data (Node.js signature)
      base64 = data.toString('base64');
    }
    
    // Convert base64 to base64url
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Fetch data from Google Ads API
   * Example endpoint: campaigns
   */
  fetchData(nodeName, customerId, fields, startDate = null) {
    const accessToken = this.getAccessToken();
    
    // Build GAQL query based on nodeName
    let query = this._buildGAQLQuery(nodeName, fields, startDate);
    
    const url = `https://googleads.googleapis.com/v16/customers/${customerId.replace(/-/g, '')}/googleAds:search`;
    
    const requestBody = {
      query: query,
      pageSize: 10000
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': this.config.DeveloperToken.value,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(requestBody),
      body: JSON.stringify(requestBody) // For Node.js compatibility
    };
    
    console.log(`Google Ads API Request URL: ${url}`);
    console.log(`GAQL Query: ${query}`);
    
    return this._fetchPaginatedData(url, options, nodeName);
  }

  /**
   * Build GAQL query based on node type
   */
  _buildGAQLQuery(nodeName, fields, startDate) {
    const fieldsList = fields.join(', ');
    
    switch (nodeName) {
      case 'campaigns':
        let query = `SELECT ${fieldsList} FROM campaign`;
        if (startDate) {
          const formattedDate = EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd");
          query += ` WHERE segments.date = '${formattedDate}'`;
        }
        return query;
        
      case 'ad_groups':
        return `SELECT ${fieldsList} FROM ad_group`;
        
      case 'ads':
        return `SELECT ${fieldsList} FROM ad_group_ad`;
        
      case 'keywords':
        return `SELECT ${fieldsList} FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD'`;
        
      default:
        throw new Error(`Unknown nodeName: ${nodeName}`);
    }
  }

  /**
   * Fetch paginated data from Google Ads API
   */
  _fetchPaginatedData(url, options, nodeName) {
    let allData = [];
    let nextPageToken = null;
    
    do {
      const requestBody = JSON.parse(options.payload);
      if (nextPageToken) {
        requestBody.pageToken = nextPageToken;
        options.payload = JSON.stringify(requestBody);
        options.body = JSON.stringify(requestBody);
      }
      
      const response = this.urlFetchWithRetry(url, options);
      const jsonData = JSON.parse(response.getContentText());
      
      if (jsonData.error) {
        throw new Error(`Google Ads API error: ${jsonData.error.message}`);
      }
      
      if (jsonData.results) {
        // Process each result and flatten the nested structure
        const processedResults = jsonData.results.map(result => this._flattenResult(result, nodeName));
        allData = allData.concat(processedResults);
      }
      
      nextPageToken = jsonData.nextPageToken || null;
      console.log(`Fetched ${allData.length} records so far...`);
      
    } while (nextPageToken);
    
    return allData;
  }

  /**
   * Flatten Google Ads API nested response structure
   */
  _flattenResult(result, nodeName) {
    const flattened = {};
    
    // Flatten nested objects (campaign.id -> campaign_id)
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [subKey, subValue] of Object.entries(value)) {
          flattened[`${key}_${subKey}`] = subValue;
        }
      } else {
        flattened[key] = value;
      }
    }
    
    return flattened;
  }
};
