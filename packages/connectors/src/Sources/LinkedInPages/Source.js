/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInPagesSource = class LinkedInPagesSource extends AbstractSource {
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
                  key: 'OAUTH_LINKEDIN_PAGES_CLIENT_ID',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED]
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_PAGES_CLIENT_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED]
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_PAGES_REDIRECT_URI',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.REQUIRED]
                },
                Scopes: {
                  type: 'string',
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_PAGES_SCOPE',
                  default: 'r_organization_social,rw_organization_admin,offline_access',
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
      OrganizationURNs: {
        isRequired: true,
        label: "Organization URNs",
        description: "LinkedIn Organization URNs to fetch data from"
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      }
    }));
    
    this.fieldsSchema = LinkedInPagesFieldsSchema;
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
        .withUser({ id: 'unknown', name: 'LinkedIn Pages User' })
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
        message: 'Failed to exchange LinkedIn Pages authorization code',
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
    return oauthConfig.ClientId?.value || this.config.ClientID?.value || process.env.OAUTH_LINKEDIN_PAGES_CLIENT_ID;
  }

  _getClientSecret() {
    const oauthConfig = this._getOAuthConfig();
    return oauthConfig.ClientSecret?.value || this.config.ClientSecret?.value || process.env.OAUTH_LINKEDIN_PAGES_CLIENT_SECRET;
  }

  _getRefreshToken() {
    const oauthConfig = this._getOAuthConfig();
    return oauthConfig.RefreshToken?.value || this.config.RefreshToken?.value;
  }

  /**
   * Main entry point for fetching data from LinkedIn Pages API
   * @param {string} nodeName - Type of resource to fetch
   * @param {string|number} urn - Organization ID (numeric)
   * @param {Object} params - Additional parameters for the request
   * @returns {Array} - Array of processed data objects
   */
  async fetchData(nodeName, urn, params = {}) {
    const fields = params.fields || [];
    const uniqueKeys = this.fieldsSchema[nodeName]?.uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
    }
    
    switch (nodeName) {
      case "follower_statistics_time_bound":
        return await this.fetchOrganizationStats({
          urn, 
          nodeName,
          endpoint: "organizationalEntityFollowerStatistics",
          entityParam: "organizationalEntity",
          formatter: this.transformFollowerStatisticsTimeBound.bind(this),
          params
        });
      case "follower_statistics":
        return await this.fetchOrganizationStats({
          urn, 
          nodeName,
          endpoint: "organizationalEntityFollowerStatistics",
          entityParam: "organizationalEntity",
          formatter: this.transformFollowerStatistics.bind(this),
          params
        });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch organization statistics from LinkedIn Pages API
   * @param {Object} options - Options for the request
   * @param {string|number} options.urn - Organization ID (numeric)
   * @param {string} options.nodeName - The node name from the schema
   * @param {string} options.endpoint - API endpoint name
   * @param {string} options.entityParam - Parameter name for the organization URN
   * @param {Function} options.formatter - Function to format the response data
   * @param {Date} [options.params.startDate] - Start date for time-bound data
   * @param {Date} [options.params.endDate] - End date for time-bound data
   * @param {Array} [options.params.fields] - Additional parameters including fields
   * @returns {Array} - Processed statistics data
   */
  async fetchOrganizationStats(options) {
    const { urn, nodeName, endpoint, entityParam, formatter, params } = options;
    const orgUrn = `urn:li:organization:${urn}`;
    const encodedUrn = encodeURIComponent(orgUrn);

    let url = `${this.BASE_URL}${endpoint}?q=${entityParam}&${entityParam}=${encodedUrn}`;

    const isTimeSeries = this.fieldsSchema[nodeName].isTimeSeries;

    if (isTimeSeries && params.startDate && params.endDate) {
      const startTimestamp = new Date(params.startDate).getTime();
      const endTimestamp = new Date(params.endDate).getTime();
      url += `&timeIntervals=(timeRange:(start:${startTimestamp},end:${endTimestamp}),timeGranularityType:DAY)`;
    }

    const response = await this.makeRequest(url);
    const elements = response.elements || [];

    if (elements.length === 0) {
      return [];
    }

    return formatter({
      elements,
      orgUrn,
      fields: params.fields
    });
  }

  /**
   * Make a request to LinkedIn API with proper headers and auth
   * @param {string} url - Full API endpoint URL
   * @param {Object} headers - Optional additional headers
   * @returns {Object} - API response parsed from JSON
   */
  async makeRequest(url) {
    console.log(`LinkedIn Pages API URL:`, url);
    const clientId = this._getClientId();
    const clientSecret = this._getClientSecret();
    const refreshToken = this._getRefreshToken();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('LinkedIn Pages OAuth credentials are not configured');
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
    const result = await response.getContentText();
    const parsedResult = JSON.parse(result);
    if (parsedResult.status && parsedResult.status >= HTTP_STATUS.BAD_REQUEST) {
      throw new Error(`LinkedIn API Error: ${parsedResult.message || 'Unknown error'} (Status: ${parsedResult.status})`);
    }
    return parsedResult;
  }
  
  /**
   * Process time-bound statistics data
   * @param {Object} params - Parameters object
   * @param {Array} params.elements - API response elements
   * @param {string} params.orgUrn - Organization URN
   * @param {Object} params.options - Original options passed to fetchOrganizationStats
   * @returns {Array} - Processed time-bound statistics
   */
  transformFollowerStatisticsTimeBound({ elements, orgUrn, fields }) {    
    return elements.map(element => {
      const dataObj = {
        organization_urn: element.organizationalEntity,
        time_range_start: element.timeRange.start,
        time_range_end: element.timeRange.end,
        organic_follower_gain: element.followerGains?.organicFollowerGain || 0,
        paid_follower_gain: element.followerGains?.paidFollowerGain || 0,
        follower_counts_by_association_type: element.followerCountsByAssociationType || [],
        follower_counts_by_seniority: element.followerCountsBySeniority || [],
        follower_counts_by_industry: element.followerCountsByIndustry || [],
        follower_counts_by_function: element.followerCountsByFunction || [],
        follower_counts_by_staff_count_range: element.followerCountsByStaffCountRange || [],
        follower_counts_by_geo_country: element.followerCountsByGeoCountry || [],
        follower_counts_by_geo: element.followerCountsByGeo || []
      };
      
      return this.filterDataByFields(dataObj, fields);
    });
  }

  /**
   * Transform follower statistics into a denormalized format
   * @param {Object} params - Parameters object
   * @param {Array} params.elements - Response elements from the API
   * @param {string} params.orgUrn - Organization URN
   * @param {Object} params.options - Original options passed to fetchOrganizationStats
   * @returns {Array} - Denormalized follower statistics
   */
  transformFollowerStatistics({ elements, orgUrn, fields }) {
    const results = [];
    const element = elements[0];
    const organizationUrn = element.organizationalEntity || orgUrn;
    const categoryTypes = this.extractCategoryTypes(element);
    
    categoryTypes.forEach(category => {
      const items = element[category.type] || [];
      items.forEach(item => {
        const dataObj = {
          organization_urn: organizationUrn,
          category_type: category.type,
          segment_name: category.segmentName,
          segment_value: item[category.segmentName],
          organic_follower_count: item.followerCounts?.organicFollowerCount || 0,
          paid_follower_count: item.followerCounts?.paidFollowerCount || 0
        };
        
        results.push(this.filterDataByFields(dataObj, fields));
      });
    });
    
    return results;
  }
  
  /**
   * Extract category types from the API response element
   * @param {Object} element - The API response element
   * @returns {Array} - Array of category type descriptors
   */
  extractCategoryTypes(element) {
    return Object.keys(element)
      .filter(key => 
        // Check if the property is an array containing elements with followerCounts
        Array.isArray(element[key]) && 
        element[key].length > 0 && 
        element[key][0]?.followerCounts !== undefined
      )
      .map(type => {
        // Get the first item from the array, or empty object as fallback
        const firstItem = element[type][0] || {};
        
        // Find a key that is not 'followerCounts' to use as segment name
        const segmentKeys = Object.keys(firstItem).filter(key => key !== 'followerCounts');
                  
        return { type, segmentName: segmentKeys[0] };
      });
  }

  /**
   * Filter object properties by allowed field names
   * @param {Object} dataObj - Original data object
   * @param {Array} fields - Array of allowed field names
   * @returns {Object} - Filtered object with only allowed fields
   */
  filterDataByFields(dataObj, fields) {
    return Object.keys(dataObj)
      .filter(key => fields.includes(key))
      .reduce((obj, key) => {
        obj[key] = dataObj[key];
        return obj;
      }, {});
  }
};
