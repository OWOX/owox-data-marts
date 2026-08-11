/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

export class GoogleAdsSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      CustomerId: {
        isRequired: true,
        requiredType: 'string',
        label: 'Customer ID',
        description: 'Google Ads Customer ID (format: 123-456-7890 or 1234567890)',
        placeholder: 'Enter Customer ID',
      },
      LoginCustomerId: {
        requiredType: 'string',
        label: 'Login Customer ID',
        description:
          'Optional when authenticating as the same account. Provide the manager account ID (format: 123-456-7890 or 1234567890) when acting on behalf of other accounts.',
        placeholder: 'Enter Login Customer ID',
        attributes: [CONFIG_ATTRIBUTES.PINNED],
      },
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
                  key: 'OAUTH_GOOGLE_ADS_CLIENT_ID',
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
                  key: 'OAUTH_GOOGLE_ADS_CLIENT_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED],
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_GOOGLE_ADS_REDIRECT_URI',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.REQUIRED],
                },
                DeveloperToken: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED],
                },
              },
              mapping: {
                RefreshToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'refresh_token',
                },
                AccessToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'access_token',
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
                DeveloperToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'developer_token',
                },
              },
            },
            items: {
              RefreshToken: {
                isRequired: true,
                requiredType: 'string',
                label: 'Refresh Token',
                description: 'OAuth2 Refresh Token',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              ClientId: {
                isRequired: true,
                requiredType: 'string',
                label: 'Client ID',
                description: 'OAuth2 Client ID',
              },
              ClientSecret: {
                isRequired: true,
                requiredType: 'string',
                label: 'Client Secret',
                description: 'OAuth2 Client Secret',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              DeveloperToken: {
                isRequired: true,
                requiredType: 'string',
                label: 'Developer Token',
                description: 'Google Ads API Developer Token',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
            },
          },
          {
            label: 'Service Account',
            value: 'service_account',
            requiredType: 'object',
            items: {
              ServiceAccountKey: {
                isRequired: true,
                requiredType: 'string',
                label: 'Service Account Key (JSON)',
                description: 'Google Service Account JSON key file content',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              DeveloperToken: {
                isRequired: true,
                requiredType: 'string',
                label: 'Developer Token',
                description: 'Google Ads API Developer Token',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
            },
          },
        ],
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
        description: 'List of fields to fetch from Google Ads API',
      },
      CreateEmptyTables: {
        requiredType: 'boolean',
        default: true,
        label: 'Create Empty Tables',
        description:
          'Create tables with all columns even if no data is returned from API (true/false)',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
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
    };

    this.context.registerParameters(this.parameters, PARAMETER_OWNER.SOURCE);

    this.fieldsSchema = GoogleAdsFieldsSchema;
    this.accessToken = null;
    this.tokenExpiryTime = null;
    // Track global resources already fetched: skip on subsequent accounts to avoid redundant calls
    this._globalResourcesProcessed = new Set();
  }

  // Time-series Google Ads queries filter by `segments.date = 'YYYY-MM-DD'` — one day per call.
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.DAY_BY_DAY;
  }

  getAccounts(context) {
    const customerIdParam = context.getParameter('CustomerId');
    if (!customerIdParam?.value) return [null];
    return FormatUtils.parseIds(customerIdParam.value, { stripCharacters: '-' }).map(id => ({
      id,
    }));
  }

  async exchangeOauthCredentials(credentials, variables) {
    try {
      const tokenUrl = 'https://oauth2.googleapis.com/token';

      const payload = {
        client_id: variables.ClientId,
        client_secret: variables.ClientSecret,
        grant_type: 'authorization_code',
        code: credentials.code,
        redirect_uri: variables.RedirectUri,
      };

      const options = {
        method: 'post',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: Object.entries(payload)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&'),
      };

      const resp = await fetch(tokenUrl, options);
      const data = await resp.json();

      if (data.error) {
        throw new OauthFlowException({
          message: `Token exchange failed: ${data.error_description || data.error}`,
          payload: data,
        });
      }

      // Guard: refuse to store credentials without refresh_token
      if (!data.refresh_token) {
        throw new OauthFlowException({
          message:
            'No refresh_token returned. Please revoke access at https://myaccount.google.com/permissions and try again.',
          payload: data,
        });
      }

      // Fetch user email (graceful fallback if fails)
      let userData = { id: 'unknown', name: null };
      try {
        const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        const userInfo = await userResp.json();
        if (userInfo.id) {
          userData = { id: userInfo.id, name: userInfo.email };
        }
      } catch (_) {
        // userinfo failure is non-fatal — credentials still work without email
      }

      const expiresIn = data.expires_in ?? 3600;

      return OauthCredentialsDto.builder()
        .withUser(userData)
        .withSecret({
          refresh_token: data.refresh_token,
          access_token: data.access_token,
          client_id: variables.ClientId,
          client_secret: variables.ClientSecret,
          developer_token: variables.DeveloperToken,
        })
        .withExpiresIn(expiresIn)
        .build()
        .toObject();
    } catch (error) {
      if (error instanceof OauthFlowException) {
        throw error;
      }
      throw new OauthFlowException({
        message: 'Failed to exchange Google Ads tokens',
        payload: error.message,
      });
    }
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

    const authTypeParam = this.context.getParameter('AuthType');
    const authType = authTypeParam?.value;
    if (!authType) {
      throw new Error('AuthType not configured');
    }

    const authConfig = authTypeParam.items;
    let accessToken;

    try {
      if (authType === 'oauth2') {
        accessToken = await OAuthUtils.getAccessToken({
          context: this.context,
          tokenUrl: 'https://oauth2.googleapis.com/token',
          formData: {
            grant_type: 'refresh_token',
            client_id: authConfig.ClientId.value,
            client_secret: authConfig.ClientSecret.value,
            refresh_token: authConfig.RefreshToken.value,
          },
        });
      } else if (authType === 'service_account') {
        accessToken = await OAuthUtils.getServiceAccountToken({
          context: this.context,
          tokenUrl: 'https://oauth2.googleapis.com/token',
          serviceAccountKeyJson: authConfig.ServiceAccountKey.value,
          scope: 'https://www.googleapis.com/auth/adwords',
        });
      } else {
        throw new Error(`Unknown authentication type: ${authType}`);
      }

      this.accessToken = accessToken;
      this.tokenExpiryTime = Date.now() + (3600 - 60) * 1000;

      return this.accessToken;
    } catch (error) {
      this.context.log(LOG_LEVEL.ERROR, `Authentication failed: ${error.message}`);
      const wrapped = new Error(`Authentication failed: ${error.message}`);
      // Rewrapping loses the classification unless it is handed over explicitly, and a
      // dead refresh token would then page as an error.
      wrapped.isWarning = error.isWarning;
      throw wrapped;
    }
  }

  /**
   * Fetch data from Google Ads API. AbstractConnector calls us with
   * { nodeName, fields, accountId, startDate, endDate } per (account × node × day).
   */
  async fetchData({ nodeName, fields, accountId, startDate, endDate }) {
    const customerId = accountId;

    // Global resources return identical data for any customer ID — fetch once.
    const schema = this.fieldsSchema[nodeName];
    if (schema?.isGlobalResource) {
      if (this._globalResourcesProcessed.has(nodeName)) {
        return [];
      }
      this._globalResourcesProcessed.add(nodeName);
    }

    this.context.log(
      LOG_LEVEL.INFO,
      `Fetching data from Google Ads API for customer: ${customerId}`
    );
    const query = this._buildQuery({ nodeName, fields, startDate });
    const response = await this.makeRequest({ customerId, query, nodeName, fields });
    return response;
  }

  /**
   * Convert field names to API field names
   * @private
   */
  _getAPIFields(fields, nodeName) {
    return fields.map(fieldName => this.fieldsSchema[nodeName].fields[fieldName].apiName);
  }

  /**
   * Get Google Ads resource name by node name
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
      case 'geo_stats':
        return 'geographic_view';
      case 'geo_target_constants':
        return 'geo_target_constant';
      default:
        throw new Error(`Unknown resource name for nodeName: ${nodeName}`);
    }
  }

  /**
   * Build GAQL query based on node type.
   * For time series nodes, adds WHERE segments.date filter for the given date.
   * For catalog nodes with a whereClause defined in the schema, appends it as a static WHERE filter.
   * @private
   */
  _buildQuery({ nodeName, fields, startDate }) {
    const apiFields = this._getAPIFields(fields, nodeName);
    const resourceName = this._getResourceName(nodeName);
    let query = `SELECT ${apiFields.join(', ')} FROM ${resourceName}`;

    if (startDate && this.fieldsSchema[nodeName].isTimeSeries) {
      // startDate comes as YYYY-MM-DD from AbstractConnector under 'day-by-day'.
      query += ` WHERE segments.date = '${startDate}'`;
    } else if (this.fieldsSchema[nodeName].whereClause) {
      query += ` WHERE ${this.fieldsSchema[nodeName].whereClause}`;
    }

    return query;
  }

  /**
   * Make a request to Google Ads API with pagination support
   */
  async makeRequest({ customerId, query, nodeName, fields }) {
    const accessToken = await this.getAccessToken();
    const url = `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`;

    this.context.log(LOG_LEVEL.INFO, `Google Ads API Request URL: ${url}`);
    this.context.log(LOG_LEVEL.INFO, `GAQL Query: ${query}`);

    let allData = [];
    let nextPageToken = null;

    const authTypeParam = this.context.getParameter('AuthType');
    const authItems = authTypeParam?.items || {};

    do {
      const requestBody = { query };
      if (nextPageToken) {
        requestBody.pageToken = nextPageToken;
      }
      // Manager-account header: prefer a top-level LoginCustomerId (how prod
      // stores it), falling back to the nested AuthType.oauth2.LoginCustomerId.
      const topLevelLoginCustomerId = this.context.getParameter('LoginCustomerId')?.value;
      const loginCustomerIdRaw =
        topLevelLoginCustomerId !== undefined
          ? topLevelLoginCustomerId
          : authItems.LoginCustomerId?.value;
      const loginCustomerId = loginCustomerIdRaw
        ? FormatUtils.parseIds(loginCustomerIdRaw, { stripCharacters: '-' })[0]
        : null;
      const shouldIncludeLoginCustomerIdHeader = loginCustomerId && loginCustomerId !== customerId;

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token':
          authItems.DeveloperToken?.value || process.env.OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      };

      if (shouldIncludeLoginCustomerIdHeader) {
        headers['login-customer-id'] = loginCustomerId;
      }

      const options = {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      };

      let response;
      try {
        response = await this.urlFetchWithRetry(url, options);
      } catch (error) {
        if (error.payload?.error) {
          this.context.log(
            LOG_LEVEL.ERROR,
            `Google Ads API error payload: ${JSON.stringify(error.payload.error, null, 2)}`
          );
        }
        throw error;
      }
      const text = await response.text();
      const jsonData = JSON.parse(text);
      // At this point HTTP was successful; this is a defensive check for unexpected API responses.
      if (jsonData.error) {
        this.context.log(
          LOG_LEVEL.ERROR,
          `Google Ads API error payload: ${JSON.stringify(jsonData.error, null, 2)}`
        );
        throw new Error(`Google Ads API error: ${jsonData.error.message}`);
      }

      if (jsonData.results) {
        const processedResults = jsonData.results.map(result =>
          this._mapResultToColumns(result, nodeName, fields)
        );
        allData = allData.concat(processedResults);
      }

      nextPageToken = jsonData.nextPageToken || null;
      this.context.log(LOG_LEVEL.INFO, `Fetched ${allData.length} records so far...`);
    } while (nextPageToken);

    return allData;
  }

  /**
   * Map API result to requested column names
   * @private
   */
  _mapResultToColumns(result, nodeName, requestedFields) {
    const mapped = {};

    for (const fieldName of requestedFields) {
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
      let value = this._getNestedValue(result, camelPath);

      // Some v25 fields (e.g. campaign.start_date_time) return "yyyy-MM-dd HH:mm:ss"
      // where the schema still promises a bare date; keep the stored value backward
      // compatible by dropping the time component.
      if (fieldConfig.dateOnly && typeof value === 'string') {
        value = value.split(' ')[0];
      }

      mapped[fieldName] = value;
    }

    return mapped;
  }

  _snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
