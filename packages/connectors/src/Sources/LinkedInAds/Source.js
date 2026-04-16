/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInAdsSource = class LinkedInAdsSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
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
            attributes: [CONFIG_ATTRIBUTES.OAUTH_FLOW],
            oauthParams: {
              vars: {
                ClientId: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_CLIENT_ID',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED]
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_CLIENT_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED]
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_REDIRECT_URI',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.REQUIRED]
                },
                Scopes: {
                  type: 'string',
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_SCOPE',
                  default: 'r_ads,r_ads_reporting,offline_access',
                  attributes: [OAUTH_CONSTANTS.UI]
                }
              },
              mapping: {
                RefreshToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'refresh_token'
                },
                ClientId: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'client_id'
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'client_secret'
                },
                AccessToken: {
                  type: 'string',
                  required: false,
                  store: 'secret',
                  key: 'access_token'
                }
              }
            },
            items: {
              ClientId: {
                isRequired: true,
                requiredType: "string",
                label: "Client ID",
                description: "LinkedIn API Client ID for authentication"
              },
              ClientSecret: {
                isRequired: true,
                requiredType: "string",
                label: "Primary Client Secret",
                description: "LinkedIn API Primary Client Secret for authentication",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
              RefreshToken: {
                isRequired: true,
                requiredType: "string",
                label: "Refresh Token",
                description: "LinkedIn API Refresh Token for authentication",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
              AccessToken: {
                requiredType: "string",
                label: "Access Token",
                description: "LinkedIn API Access Token (auto-generated)",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              }
            }
          }
        ]
      },
      ClientID: {
        isRequired: false,
        requiredType: "string",
        label: "Client ID",
        description: "LinkedIn API Client ID for authentication",
        attributes: [CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      ClientSecret: {
        isRequired: false,
        requiredType: "string",
        label: "Primary Client Secret",
        description: "LinkedIn API Primary Client Secret for authentication",
        attributes: [CONFIG_ATTRIBUTES.SECRET, CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      RefreshToken: {
        isRequired: false,
        requiredType: "string",
        label: "Refresh Token",
        description: "LinkedIn API Refresh Token for authentication",
        attributes: [CONFIG_ATTRIBUTES.SECRET, CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
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
      Fields: {
        isRequired: true,
        label: "Fields",
        description: "List of fields to fetch from LinkedIn API"
      },
      AccountURNs: {
        isRequired: true,
        label: "Account URNs",
        description: "LinkedIn Ads Account URNs to fetch data from"
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      }
    }));
    
    this.fieldsSchema = LinkedInAdsFieldsSchema;
    this.MAX_FIELDS_PER_REQUEST = 20;
    this.BASE_URL = "https://api.linkedin.com/rest/";
  
  }

  async exchangeOauthCredentials(credentials, variables) {
    try {
      const tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
      const payload = {
        grant_type: 'authorization_code',
        code: credentials.code,
        client_id: variables.ClientId,
        client_secret: variables.ClientSecret,
        redirect_uri: variables.RedirectUri,
      };

      const options = {
        method: 'post',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: Object.entries(payload)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      };

      const response = await HttpUtils.fetch(tokenUrl, options);
      const data = await response.getAsJson();

      if (data.error || !data.refresh_token) {
        throw new OauthFlowException({
          message: data.error_description || data.error || 'Failed to exchange LinkedIn authorization code',
          payload: data
        });
      }

      const expiresIn = data.expires_in ?? 3600;

      return OauthCredentialsDto.builder()
        .withUser({ id: 'unknown', name: 'LinkedIn Ads User' })
        .withSecret({
          refresh_token: data.refresh_token,
          access_token: data.access_token,
          client_id: variables.ClientId,
          client_secret: variables.ClientSecret
        })
        .withExpiresIn(expiresIn)
        .build()
        .toObject();
    } catch (error) {
      if (error instanceof OauthFlowException) {
        throw error;
      }
      throw new OauthFlowException({
        message: 'Failed to exchange LinkedIn Ads authorization code',
        payload: error.message
      });
    }
  }

  _getOAuthConfig() {
    const authTypeConfig = this.config.AuthType || {};
    const isOAuth2 = this.config.AuthType?.value === 'oauth2';
    return isOAuth2 ? (authTypeConfig.items || {}) : {};
  }

  _getClientId() {
    const oauthConfig = this._getOAuthConfig();
    return oauthConfig.ClientId?.value || this.config.ClientID?.value || process.env.OAUTH_LINKEDIN_ADS_CLIENT_ID;
  }

  _getClientSecret() {
    const oauthConfig = this._getOAuthConfig();
    return oauthConfig.ClientSecret?.value || this.config.ClientSecret?.value || process.env.OAUTH_LINKEDIN_ADS_CLIENT_SECRET;
  }

  _getRefreshToken() {
    const oauthConfig = this._getOAuthConfig();
    return oauthConfig.RefreshToken?.value || this.config.RefreshToken?.value;
  }

  /**
   * Main entry point for fetching data from LinkedIn Ads API
   * @param {string} nodeName - Type of resource to fetch (e.g., adAccounts, adCampaigns)
   * @param {string} urn - Resource identifier
   * @param {Object} params - Additional parameters for the request
   * @returns {Array} - Array of fetched data objects
   */
  async fetchData(nodeName, urn, params = {}) {
    const fields = params.fields || [];
    const uniqueKeys = this.fieldsSchema[nodeName]?.uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }
    
    switch (nodeName) {
      case "adAccounts":
        return await this.fetchSingleResource({ urn, resourceType: 'adAccounts', params });
      case "adCampaignGroups":
        return await this.fetchAdResource({ urn, resourceType: 'adCampaignGroups', params });
      case "adCampaigns":
        return await this.fetchAdResource({ urn, resourceType: 'adCampaigns', params });
      case "creatives":
        return await this.fetchAdResource({ urn, resourceType: 'creatives', params, queryType: 'criteria' });
      case "adAnalytics":
        return await this.fetchAdAnalytics(urn, params);
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch a single resource by ID
   * @param {Object} options - Request options
   * @param {string} options.urn - Resource identifier
   * @param {string} options.resourceType - Type of resource to fetch
   * @param {Object} options.params - Additional parameters for the request
   * @returns {Array} - Array containing the single resource
   */
  async fetchSingleResource({ urn, resourceType, params }) {
    let url = `${this.BASE_URL}${resourceType}/${encodeURIComponent(urn)}`;
    url += `?fields=${this.formatFields(params.fields)}`;

    const result = await this.makeRequest(url);
    return [result]; // Return as array to match other endpoints
  }

  /**
   * Fetch a collection of resources for an account
   * @param {Object} options - Request options
   * @param {string} options.urn - Account identifier
   * @param {string} options.resourceType - Type of resources to fetch
   * @param {Object} options.params - Additional parameters for the request
   * @param {string} [options.queryType='search'] - Query type parameter
   * @returns {Array} - Array of fetched resources
   */
  async fetchAdResource({ urn, resourceType, params, queryType = 'search' }) {
    let url = `${this.BASE_URL}adAccounts/${encodeURIComponent(urn)}/${resourceType}?q=${queryType}&pageSize=100`;
    url += `&fields=${this.formatFields(params.fields)}`;

    return await this.fetchWithPagination(url);
  }

  /**
   * Fetch analytics data, handling field limits and data merging
   * @param {string} urn - Account identifier
   * @param {Object} params - Request parameters
   * @param {string} params.startDate - Start date for analytics data
   * @param {string} params.endDate - End date for analytics data
   * @param {Array} params.fields - Fields to fetch
   * @returns {Array} - Combined array of analytics data
   */
  async fetchAdAnalytics(urn, params) {
    const startDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);
    const accountUrn = `urn:li:sponsoredAccount:${urn}`;
    const encodedUrn = encodeURIComponent(accountUrn);
    let allResults = [];
    const uniqueApiFields = this.convertFieldsForApi(params.fields || []);

    // LinkedIn API has a limitation - it allows a maximum of fields per request
    // To overcome this, split fields into chunks and make multiple requests
    const fieldChunks = this.prepareAnalyticsFieldChunks(uniqueApiFields);

    // Process each chunk of fields in separate API requests
    for (const fieldChunk of fieldChunks) {
      const url = this.buildAdAnalyticsUrl({
        startDate,
        endDate,
        encodedUrn,
        fields: fieldChunk
      });
      const res = await this.makeRequest(url);
      const elements = res.elements || [];

      // Merge results from different chunks into a single dataset
      // Each chunk contains the same rows but different fields
      allResults = this.mergeAnalyticsResults(allResults, elements);
    }

    // Transform complex dateRange objects to simple Date objects
    return this.transformAnalyticsDateRanges(allResults);
  }

  /**
   * Convert custom date fields to LinkedIn API compatible fields
   * @param {Array} fields - Original list of fields from user selection
   * @returns {Array} - Fields converted for LinkedIn API with duplicates removed
   */
  convertFieldsForApi(fields) {
    const apiFields = fields.map(field => {
      if (field === 'dateRangeStart' || field === 'dateRangeEnd') {
        return 'dateRange';
      }
      return field;
    });
    
    return [...new Set(apiFields)];
  }

  /**
   * Prepare field chunks for analytics API requests
   * @param {Array} fields - Original list of fields to request
   * @returns {Array} - Array of field chunks, each respecting the API field limit
   */
  prepareAnalyticsFieldChunks(fields) {
    // These fields are required in all requests for proper merging
    const requiredFields = ['dateRange', 'pivotValues'];
    
    // Remove duplicates and required fields from the user fields
    // Add required fields to each chunk separately
    const uniqueFields = [...new Set(fields)].filter(field => !requiredFields.includes(field));
    
    const maxCustomFieldsPerChunk = this.MAX_FIELDS_PER_REQUEST - requiredFields.length;
    const fieldChunks = [];
    
    for (let i = 0; i < uniqueFields.length; i += maxCustomFieldsPerChunk) {
      const customFields = uniqueFields.slice(i, i + maxCustomFieldsPerChunk);
      const chunk = [...requiredFields, ...customFields];
      
      fieldChunks.push(chunk);
    }
    
    // Handle the case when there are no custom fields at all
    if (fieldChunks.length === 0) {
      fieldChunks.push([...requiredFields]);
    }
    
    return fieldChunks;
  }

  /**
   * Build URL for analytics API request
   * @param {Object} options - URL building options
   * @param {Date} options.startDate - Start date for analytics data
   * @param {Date} options.endDate - End date for analytics data
   * @param {string} options.encodedUrn - URL-encoded account URN
   * @param {Array} options.fields - Fields to request
   * @returns {string} - Complete API request URL
   */
  buildAdAnalyticsUrl({ startDate, endDate, encodedUrn, fields }) {
    // Construct the URL for the LinkedIn Analytics API
    return `${this.BASE_URL}adAnalytics?q=statistics` +
      `&dateRange=(start:${this.formatDateForUrl(startDate)},` +
      `end:${this.formatDateForUrl(endDate)})` +
      `&pivots=List(CREATIVE,CAMPAIGN,CAMPAIGN_GROUP,ACCOUNT)` +
      `&timeGranularity=DAILY` +
      `&accounts=List(${encodedUrn})` +
      `&fields=${this.formatFields(fields)}`;
  }

  /**
    * Format date for LinkedIn API URL parameters
    * @param {Date} date - Date object
    * @return {string} Formatted date string for LinkedIn API
    */
  formatDateForUrl(date) {
    return `(year:${date.getFullYear()},month:${date.getMonth() + 1},day:${date.getDate()})`;
  }

  /**
   * Format an array of field names for use in API URLs
   * @param {Array<string>} fields - Array of field names
   * @return {string} Comma-separated string of URL-encoded field names
   */
  formatFields(fields) {
    return fields.map(field => encodeURIComponent(field)).join(",");
  }

  /**
   * Merge results from multiple analytics API requests
   * @param {Array} existingResults - The existing results array
   * @param {Array} newElements - New elements to merge
   * @returns {Array} - The combined results array
   */
  mergeAnalyticsResults(existingResults, newElements) {
    // If there are no existing results, return the new elements
    if (existingResults.length === 0) {
      return [...newElements];
    }

    const mergedResults = [...existingResults];
    
    // For each new element, check if it already exists in the results
    // The uniqueness of a row is determined by dateRange and pivotValues
    newElements.forEach(newElem => {
      // Find existing element with the same dateRange and pivotValues
      // These two fields uniquely identify each data point in the analytics data
      const existingIndex = mergedResults.findIndex(existing =>
        JSON.stringify(existing.dateRange) === JSON.stringify(newElem.dateRange) &&
        JSON.stringify(existing.pivotValues) === JSON.stringify(newElem.pivotValues)
      );
      
      if (existingIndex >= 0) {
        // If element with the same key exists, merge its fields with the new element's fields
        // This combines metrics from different requests into a single comprehensive record
        mergedResults[existingIndex] = { ...mergedResults[existingIndex], ...newElem };
      } else {
        // If no matching element exists, add the new element to the results
        mergedResults.push(newElem);
      }
    });
    
    return mergedResults;
  }

  /**
   * Transform complex dateRange objects to separate dateRangeStart and dateRangeEnd fields
   * @param {Array} analyticsData - Array of analytics data records
   * @returns {Array} - Transformed analytics data
   */
  transformAnalyticsDateRanges(analyticsData) {
    if (!analyticsData || !analyticsData.length) {
      return analyticsData;
    }

    return analyticsData.map(item => {
      const res = { ...item };

      if (res.dateRange?.start) {
        res.dateRangeStart = this.formatDateFromLinkedInObject(res.dateRange.start);
      }

      if (res.dateRange?.end) {
        res.dateRangeEnd = this.formatDateFromLinkedInObject(res.dateRange.end);
      }

      delete res.dateRange;
      return res;
    });
  }

  /**
   * Format LinkedIn date object to YYYY-MM-DD string
   * @param {Object} dateObj - LinkedIn date object with year, month, day properties
   * @returns {string} - Formatted date string (YYYY-MM-DD)
   */
  formatDateFromLinkedInObject(dateObj) {
    const { year, month, day } = dateObj;
    const pad = n => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  /**
   * Make a request to LinkedIn API with proper headers and auth
   * @param {string} url - Full API endpoint URL
   * @param {Object} headers - Optional additional headers
   * @returns {Object} - API response parsed from JSON
   */
  async makeRequest(url) {
    console.log(`LinkedIn Ads API Request URL:`, url);
    const clientId = this._getClientId();
    const clientSecret = this._getClientSecret();
    const refreshToken = this._getRefreshToken();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('LinkedIn Ads OAuth credentials are not configured');
    }

    await OAuthUtils.getAccessToken({
      config: this.config,
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      formData: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      }
    });

    const headers = {
      "LinkedIn-Version": "202509",
      "X-RestLi-Protocol-Version": "2.0.0",
    };

    const authUrl = `${url}${url.includes('?') ? '&' : '?'}oauth2_access_token=${this.config.AccessToken.value}`;

    const response = await HttpUtils.fetch(authUrl, { headers });
    const text = await response.getContentText();
    const result = JSON.parse(text);

    return result;
  }
  
  /**
   * Fetch resources with pagination support
   * @param {string} baseUrl - Base API endpoint URL
   * @param {Object} headers - Optional additional headers
   * @returns {Array} - Combined array of results from all pages
   */
  async fetchWithPagination(baseUrl) {
    let allResults = [];
    let pageToken = null;

    do {
      let pageUrl = baseUrl;
      if (pageToken) {
        pageUrl += `${pageUrl.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(pageToken)}`;
      }

      const res = await this.makeRequest(pageUrl);
      const elements = res.elements || [];
      allResults = allResults.concat(elements);

      const metadata = res.metadata || {};
      pageToken = metadata.nextPageToken || null;
    } while (pageToken !== null);

    return allResults;
  }
};
