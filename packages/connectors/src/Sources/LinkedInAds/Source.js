/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

export class LinkedInAdsSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      AuthType: {
        requiredType: 'object',
        label: 'Auth Type',
        description: 'Authentication type',
        isRequired: true,
        oneOf: [
          {
            label: 'OAuth2',
            value: 'oauth2',
            requiredType: 'object',
            attributes: [CONFIG_ATTRIBUTES.OAUTH_FLOW],
            oauthParams: {
              vars: {
                ClientId: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_CLIENT_ID',
                  attributes: [
                    OAUTH_CONSTANTS.UI,
                    OAUTH_CONSTANTS.SECRET,
                    OAUTH_CONSTANTS.REQUIRED,
                  ],
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_CLIENT_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED],
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_REDIRECT_URI',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.REQUIRED],
                },
                Scopes: {
                  type: 'string',
                  store: 'env',
                  key: 'OAUTH_LINKEDIN_ADS_SCOPE',
                  default: 'r_ads,r_ads_reporting',
                  attributes: [OAUTH_CONSTANTS.UI],
                },
              },
              mapping: {
                RefreshToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'refresh_token',
                },
                ClientId: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'client_id',
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'client_secret',
                },
                AccessToken: {
                  type: 'string',
                  required: false,
                  store: 'secret',
                  key: 'access_token',
                },
              },
            },
            items: {
              ClientId: {
                isRequired: true,
                requiredType: 'string',
                label: 'Client ID',
                description: 'LinkedIn API Client ID for authentication',
              },
              ClientSecret: {
                isRequired: true,
                requiredType: 'string',
                label: 'Primary Client Secret',
                description: 'LinkedIn API Primary Client Secret for authentication',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              RefreshToken: {
                isRequired: true,
                requiredType: 'string',
                label: 'Refresh Token',
                description: 'LinkedIn API Refresh Token for authentication',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              AccessToken: {
                requiredType: 'string',
                label: 'Access Token',
                description: 'LinkedIn API Access Token (auto-generated)',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
            },
          },
        ],
      },
      ClientID: {
        isRequired: false,
        requiredType: 'string',
        label: 'Client ID',
        description: 'LinkedIn API Client ID for authentication',
        attributes: [CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      ClientSecret: {
        isRequired: false,
        requiredType: 'string',
        label: 'Primary Client Secret',
        description: 'LinkedIn API Primary Client Secret for authentication',
        attributes: [
          CONFIG_ATTRIBUTES.SECRET,
          CONFIG_ATTRIBUTES.DEPRECATED,
          CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM,
        ],
      },
      RefreshToken: {
        isRequired: false,
        requiredType: 'string',
        label: 'Refresh Token',
        description: 'LinkedIn API Refresh Token for authentication',
        attributes: [
          CONFIG_ATTRIBUTES.SECRET,
          CONFIG_ATTRIBUTES.DEPRECATED,
          CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM,
        ],
      },
      ReimportLookbackWindow: {
        requiredType: 'number',
        isRequired: true,
        default: 2,
        label: 'Reimport Lookback Window',
        description: 'Number of days to look back when reimporting data',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      CleanUpToKeepWindow: {
        requiredType: 'number',
        label: 'Clean Up To Keep Window',
        description: 'Number of days to keep data before cleaning up',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      StartDate: {
        requiredType: 'date',
        label: 'Start Date',
        description: 'Start date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      EndDate: {
        requiredType: 'date',
        label: 'End Date',
        description: 'End date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      Fields: {
        isRequired: true,
        label: 'Fields',
        description: 'List of fields to fetch from LinkedIn API',
      },
      AccountURNs: {
        isRequired: true,
        label: 'Account URNs',
        description: 'LinkedIn Ads Account URNs to fetch data from',
      },
      CreateEmptyTables: {
        requiredType: 'boolean',
        default: true,
        label: 'Create Empty Tables',
        description: 'Create tables with all columns even if no data is returned from API',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
    };

    this.context.registerParameters(this.parameters, PARAMETER_OWNER.SOURCE);

    this.fieldsSchema = LinkedInAdsFieldsSchema;
    this.MAX_FIELDS_PER_REQUEST = 20;
    this.BASE_URL = 'https://api.linkedin.com/rest/';
  }

  // Time-series LinkedIn Ads analytics support a date range natively — fetch in a single call.
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.RANGE;
  }

  getAccounts(context) {
    const urnsParam = context.getParameter('AccountURNs');
    if (!urnsParam?.value) return [null];
    return FormatUtils.parseIds(urnsParam.value, { prefix: 'urn:li:sponsoredAccount:' }).map(
      id => ({ id })
    );
  }

  async exchangeOauthCredentials(credentials, variables) {
    try {
      const tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';
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
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: Object.entries(payload)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&'),
      };

      const response = await fetch(tokenUrl, options);
      const data = await response.json();

      if (data.error || !data.refresh_token) {
        throw new OauthFlowException({
          message:
            data.error_description ||
            data.error ||
            'Failed to exchange LinkedIn authorization code',
          payload: data,
        });
      }

      const expiresIn = data.expires_in ?? 3600;

      return OauthCredentialsDto.builder()
        .withUser({ id: 'unknown', name: 'LinkedIn Ads User' })
        .withSecret({
          refresh_token: data.refresh_token,
          access_token: data.access_token,
          client_id: variables.ClientId,
          client_secret: variables.ClientSecret,
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
        payload: error.message,
      });
    }
  }

  _getOAuthConfig() {
    const authTypeParam = this.context.getParameter('AuthType');
    const isOAuth2 = authTypeParam?.value === 'oauth2';
    return isOAuth2 ? authTypeParam.items || {} : {};
  }

  _getClientId() {
    const oauthConfig = this._getOAuthConfig();
    return (
      oauthConfig.ClientId?.value ||
      this.context.getParameter('ClientID')?.value ||
      process.env.OAUTH_LINKEDIN_ADS_CLIENT_ID
    );
  }

  _getClientSecret() {
    const oauthConfig = this._getOAuthConfig();
    return (
      oauthConfig.ClientSecret?.value ||
      this.context.getParameter('ClientSecret')?.value ||
      process.env.OAUTH_LINKEDIN_ADS_CLIENT_SECRET
    );
  }

  _getRefreshToken() {
    const oauthConfig = this._getOAuthConfig();
    return oauthConfig.RefreshToken?.value || this.context.getParameter('RefreshToken')?.value;
  }

  /**
   * Main entry point for fetching data from LinkedIn Ads API.
   * AbstractConnector calls us per (account × node × date-range).
   * accountId is the numeric ad account ID.
   */
  async fetchData({ nodeName, fields = [], accountId, startDate, endDate }) {
    const urn = accountId;
    const uniqueKeys = this.fieldsSchema[nodeName]?.uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(
        `Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`
      );
    }

    switch (nodeName) {
      case 'adAccounts':
        return await this.fetchSingleResource({ urn, resourceType: 'adAccounts', fields });
      case 'adCampaignGroups':
        return await this.fetchAdResource({ urn, resourceType: 'adCampaignGroups', fields });
      case 'adCampaigns':
        return await this.fetchAdResource({ urn, resourceType: 'adCampaigns', fields });
      case 'creatives':
        return await this.fetchAdResource({
          urn,
          resourceType: 'creatives',
          fields,
          queryType: 'criteria',
        });
      case 'adAnalytics':
        return await this.fetchAdAnalytics({ urn, fields, startDate, endDate });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch a single resource by URN
   */
  async fetchSingleResource({ urn, resourceType, fields }) {
    let url = `${this.BASE_URL}${resourceType}/${encodeURIComponent(urn)}`;
    url += `?fields=${this.formatFields(fields)}`;

    const result = await this.makeRequest(url);
    return [result];
  }

  /**
   * Fetch a collection of resources for an account
   */
  async fetchAdResource({ urn, resourceType, fields, queryType = 'search' }) {
    let url = `${this.BASE_URL}adAccounts/${encodeURIComponent(urn)}/${resourceType}?q=${queryType}&pageSize=100`;
    url += `&fields=${this.formatFields(fields)}`;

    return await this.fetchWithPagination(url);
  }

  /**
   * Fetch analytics data, handling field limits and data merging
   */
  async fetchAdAnalytics({ urn, fields, startDate, endDate }) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const accountUrn = `urn:li:sponsoredAccount:${urn}`;
    const encodedUrn = encodeURIComponent(accountUrn);
    let allResults = [];
    const uniqueApiFields = this.convertFieldsForApi(fields || []);

    // LinkedIn API caps fields per request — split and merge.
    const fieldChunks = this.prepareAnalyticsFieldChunks(uniqueApiFields);

    for (const fieldChunk of fieldChunks) {
      const url = this.buildAdAnalyticsUrl({
        startDate: start,
        endDate: end,
        encodedUrn,
        fields: fieldChunk,
      });
      const res = await this.makeRequest(url);
      const elements = res.elements || [];
      allResults = this.mergeAnalyticsResults(allResults, elements);
    }

    return this.transformAnalyticsDateRanges(allResults);
  }

  convertFieldsForApi(fields) {
    const apiFields = fields.map(field => {
      if (field === 'dateRangeStart' || field === 'dateRangeEnd') {
        return 'dateRange';
      }
      return field;
    });
    return [...new Set(apiFields)];
  }

  prepareAnalyticsFieldChunks(fields) {
    const requiredFields = ['dateRange', 'pivotValues'];
    const uniqueFields = [...new Set(fields)].filter(field => !requiredFields.includes(field));

    const maxCustomFieldsPerChunk = this.MAX_FIELDS_PER_REQUEST - requiredFields.length;
    const fieldChunks = [];

    for (let i = 0; i < uniqueFields.length; i += maxCustomFieldsPerChunk) {
      const customFields = uniqueFields.slice(i, i + maxCustomFieldsPerChunk);
      fieldChunks.push([...requiredFields, ...customFields]);
    }

    if (fieldChunks.length === 0) {
      fieldChunks.push([...requiredFields]);
    }

    return fieldChunks;
  }

  buildAdAnalyticsUrl({ startDate, endDate, encodedUrn, fields }) {
    return (
      `${this.BASE_URL}adAnalytics?q=statistics` +
      `&dateRange=(start:${this.formatDateForUrl(startDate)},` +
      `end:${this.formatDateForUrl(endDate)})` +
      `&pivots=List(CREATIVE,CAMPAIGN,CAMPAIGN_GROUP,ACCOUNT)` +
      `&timeGranularity=DAILY` +
      `&accounts=List(${encodedUrn})` +
      `&fields=${this.formatFields(fields)}`
    );
  }

  formatDateForUrl(date) {
    return `(year:${date.getFullYear()},month:${date.getMonth() + 1},day:${date.getDate()})`;
  }

  formatFields(fields) {
    return fields.map(field => encodeURIComponent(field)).join(',');
  }

  mergeAnalyticsResults(existingResults, newElements) {
    if (existingResults.length === 0) {
      return [...newElements];
    }

    const mergedResults = [...existingResults];

    newElements.forEach(newElem => {
      const existingIndex = mergedResults.findIndex(
        existing =>
          JSON.stringify(existing.dateRange) === JSON.stringify(newElem.dateRange) &&
          JSON.stringify(existing.pivotValues) === JSON.stringify(newElem.pivotValues)
      );

      if (existingIndex >= 0) {
        mergedResults[existingIndex] = { ...mergedResults[existingIndex], ...newElem };
      } else {
        mergedResults.push(newElem);
      }
    });

    return mergedResults;
  }

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

  formatDateFromLinkedInObject(dateObj) {
    const { year, month, day } = dateObj;
    const pad = n => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  /**
   * Make a request to LinkedIn API with proper headers and auth
   */
  async makeRequest(url) {
    this.context.log(LOG_LEVEL.INFO, `LinkedIn Ads API Request URL: ${url}`);
    const clientId = this._getClientId();
    const clientSecret = this._getClientSecret();
    const refreshToken = this._getRefreshToken();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('LinkedIn Ads OAuth credentials are not configured');
    }

    const accessToken = await OAuthUtils.getAccessToken({
      context: this.context,
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      formData: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      },
    });

    const headers = {
      'LinkedIn-Version': '202607',
      'X-RestLi-Protocol-Version': '2.0.0',
    };

    const authUrl = `${url}${url.includes('?') ? '&' : '?'}oauth2_access_token=${accessToken}`;

    const response = await this.urlFetchWithRetry(authUrl, { headers });
    const text = await response.text();
    return JSON.parse(text);
  }

  /**
   * Fetch resources with pagination support
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
}
