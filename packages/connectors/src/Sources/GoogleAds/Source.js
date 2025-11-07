/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GoogleAdsSource = class GoogleAdsSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
      CustomerId: {
        isRequired: true,
        requiredType: "string", 
        label: "Customer ID",
        description: "Google Ads Customer ID (format: 123-456-7890)"
      },
      AuthType: {
        requiredType: "object",
        label: "Auth Type",
        description: "Authentication type",
        isRequired: true,
        oneOf: [
          {
            label: "OAuth2",
            value: "oauth2",
            requiredType: "object",
            items: {
              RefreshToken: {
                isRequired: true,
                requiredType: "string",
                label: "Refresh Token",
                description: "OAuth2 Refresh Token",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
              ClientId: {
                isRequired: true,
                requiredType: "string",
                label: "Client ID",
                description: "OAuth2 Client ID"
              },
              ClientSecret: {
                isRequired: true,
                requiredType: "string",
                label: "Client Secret",
                description: "OAuth2 Client Secret",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
              DeveloperToken: {
                isRequired: true,
                requiredType: "string",
                label: "Developer Token",
                description: "Google Ads API Developer Token",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              }
            }
          },
          { 
            label: "Service Account", 
            value: "service_account", 
            requiredType: "object",
            items: {
              ServiceAccountKey: {
                isRequired: true,
                requiredType: "string",
                label: "Service Account Key (JSON)",
                description: "Google Service Account JSON key file content",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
              DeveloperToken: {
                isRequired: true,
                requiredType: "string",
                label: "Developer Token",
                description: "Google Ads API Developer Token",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              }
            }
          }
        ]
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
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API (true/false)"
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
      }
    }));
    
    this.fieldsSchema = GoogleAdsFieldsSchema;
    this.accessToken = null;
    this.tokenExpiryTime = null;
  }

  /**
   * Get access token based on authentication type
   * Supports OAuth2 and Service Account authentication
   */
  async getAccessToken() {
    // Check if we have a cached token that's still valid
    if (this.accessToken && this.tokenExpiryTime && Date.now() < this.tokenExpiryTime) {
      return this.accessToken;
    }

    const authType = this.config.AuthType?.value;
    if (!authType) {
      throw new Error("AuthType not configured");
    }

    const authConfig = this.config.AuthType.items;
    let accessToken;

    try {
      if (authType === "oauth2") {
        accessToken = await OAuthUtils.getAccessToken({
          config: this.config,
          tokenUrl: "https://oauth2.googleapis.com/token",
          formData: {
            grant_type: 'refresh_token',
            client_id: authConfig.ClientId.value,
            client_secret: authConfig.ClientSecret.value,
            refresh_token: authConfig.RefreshToken.value
          }
        });
      } else if (authType === "service_account") {
        accessToken = await OAuthUtils.getServiceAccountToken({
          config: this.config,
          tokenUrl: "https://oauth2.googleapis.com/token",
          serviceAccountKeyJson: authConfig.ServiceAccountKey.value,
          scope: "https://www.googleapis.com/auth/adwords"
        });
      } else {
        throw new Error(`Unknown authentication type: ${authType}`);
      }

      this.accessToken = accessToken;
      this.tokenExpiryTime = Date.now() + (3600 - 60) * 1000;

      return this.accessToken;
    } catch (error) {
      this.config.logMessage(`❌ Authentication failed: ${error.message}`);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

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
  async fetchData(nodeName, customerId, options) {
    console.log('Fetching data from Google Ads API for customer:', customerId);
    const { fields, startDate } = options;
    const query = this._buildQuery({ nodeName, fields, startDate });
    const response = await this.makeRequest({ customerId, query, nodeName, fields });
    return response;
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
      case 'campaigns':
      case 'campaigns_stats':
        return 'campaign';
      case 'ad_groups':
      case 'ad_groups_stats':
        return 'ad_group';
      case 'ad_group_ads_stats':
        return 'ad_group_ad';
      case 'keywords_stats':
        return 'keyword_view';
      case 'criterion':
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
      const formattedDate = DateUtils.formatDate(startDate);
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
  async makeRequest({ customerId, query, nodeName, fields }) {
    const accessToken = await this.getAccessToken();
    const url = `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`;
    
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
          'developer-token': this.config.AuthType.items?.DeveloperToken?.value,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(requestBody),
        body: JSON.stringify(requestBody),
        muteHttpExceptions: true
      };
      
      const response = await this.urlFetchWithRetry(url, options);
      const text = await response.getContentText();
      const jsonData = JSON.parse(text);
      
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
   * Map API result to requested column names
   * @param {Object} result - API response result
   * @param {string} nodeName - Name of the node for schema lookup
   * @param {Array<string>} requestedFields - Fields that were requested (e.g. ['ad_group_id', 'campaign_id'])
   * @returns {Object} - Mapped result with column names as keys
   * @private
   */
  _mapResultToColumns(result, nodeName, requestedFields) {
    const mapped = {};
    
    for (const fieldName of requestedFields) {
      // Get apiName from schema (e.g. 'ad_group_criterion.criterion_id')
      const fieldConfig = this.fieldsSchema[nodeName].fields[fieldName];
      if (!fieldConfig) {
        mapped[fieldName] = null;
        continue;
      }
      
      // Convert apiName path to camelCase path for API response
      // 'ad_group_criterion.criterion_id' -> 'adGroupCriterion.criterionId'
      const camelPath = fieldConfig.apiName
        .split('.')
        .map(part => this._snakeToCamel(part))
        .join('.');
      
      // Get value from nested API response
      mapped[fieldName] = this._getNestedValue(result, camelPath);
    }
    
    return mapped;
  }

  /**
   * Convert snake_case to camelCase
   * @param {string} str - Snake case string
   * @returns {string} - CamelCase string
   * @private
   */
  _snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  
  /**
   * Get nested value from object using dot-notation path
   * @param {Object} obj - Object to search in
   * @param {string} path - Dot-notation path (e.g. 'adGroupCriterion.criterionId')
   * @returns {*} - Value at path or undefined
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
};
