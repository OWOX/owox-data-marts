/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

export class RedditAdsSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      ClientId: {
        isRequired: true,
        requiredType: 'string',
        label: 'App ID',
        description: 'Reddit Ads API App ID',
      },
      ClientSecret: {
        isRequired: true,
        requiredType: 'string',
        label: 'Secret',
        description: 'Reddit Ads API Secret',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      RedirectUri: {
        isRequired: true,
        requiredType: 'string',
        label: 'Redirect URI',
        description: 'Reddit Ads API Redirect URI for OAuth',
      },
      RefreshToken: {
        isRequired: true,
        requiredType: 'string',
        label: 'Refresh Token',
        description: 'Reddit Ads API Refresh Token',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      UserAgent: {
        isRequired: true,
        requiredType: 'string',
        label: 'User Agent',
        description: 'User Agent string for Reddit API requests',
      },
      AccessToken: {
        requiredType: 'string',
        label: 'Access Token',
        description: 'Reddit Ads API Access Token (auto-generated)',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      AccountIDs: {
        isRequired: true,
        label: 'Account IDs',
        description: 'Reddit Ads Account IDs to fetch data from',
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
        description: 'List of fields to fetch from Reddit API',
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
      CreateEmptyTables: {
        requiredType: 'boolean',
        default: true,
        label: 'Create Empty Tables',
        description: 'Create tables with all columns even if no data is returned from API',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
    };

    this.context.registerParameters(this.parameters, PARAMETER_OWNER.SOURCE);

    this.fieldsSchema = RedditFieldsSchema;
  }

  // Reports endpoints take a single date — iterate day-by-day.
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.DAY_BY_DAY;
  }

  getAccounts(context) {
    const accountIdsParam = context.getParameter('AccountIDs');
    if (!accountIdsParam?.value) return [null];
    return RedditAdsHelper.parseAccountIds(accountIdsParam.value).map(id => ({ id }));
  }

  parseFields(context) {
    const fieldsValue = context.getParameter('Fields')?.value;
    if (!fieldsValue) return {};
    return RedditAdsHelper.parseFields(fieldsValue);
  }

  /**
   * Fetches data from the Reddit API.
   * Called per (account × node × day) by AbstractConnector. Under 'day-by-day',
   * startDate === endDate (YYYY-MM-DD).
   */
  async fetchData({ nodeName, fields = [], accountId, startDate, endDate }) {
    this.context.log(
      LOG_LEVEL.INFO,
      `Fetching data from ${nodeName}/${accountId} for ${startDate}`
    );

    // Validate that all required unique keys are present in requested fields
    const uniqueKeys = this.fieldsSchema[nodeName]?.uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(
        `Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`
      );
    }

    // Refresh access token before making requests
    const tokenResponse = await this.getRedditAccessToken(
      this.context.getParameter('ClientId')?.value,
      this.context.getParameter('ClientSecret')?.value,
      this.context.getParameter('RedirectUri')?.value,
      this.context.getParameter('RefreshToken')?.value
    );

    const accessTokenParam = this.context.getParameter('AccessToken');
    if (tokenResponse.success && accessTokenParam) {
      accessTokenParam.value = tokenResponse.accessToken;
    }

    const baseUrl = 'https://ads-api.reddit.com/api/v3/';
    const formattedDate = startDate || null;

    let headers = {
      Accept: 'application/json',
      'User-Agent': this.context.getParameter('UserAgent')?.value,
      Authorization: 'Bearer ' + (accessTokenParam?.value || ''),
    };

    const endpointsMap = this.getEndpointsMap();
    const endpointConfig = endpointsMap[nodeName]({ accountId, formattedDate, fields });
    const finalUrl = baseUrl + endpointConfig.url;
    const reqMethod = endpointConfig.method || 'GET';

    if (endpointConfig.headersExtension) {
      headers = { ...headers, ...endpointConfig.headersExtension };
    }

    const options = {
      method: reqMethod.toUpperCase(),
      headers,
    };

    if (reqMethod.toLowerCase() === 'post' && endpointConfig.payload) {
      options.body = JSON.stringify(endpointConfig.payload);
    }

    let allData = [];
    let nextPageURL = finalUrl;

    while (nextPageURL) {
      try {
        const response = await this.urlFetchWithRetry(nextPageURL, options);
        const jsonData = await response.json();

        if ('data' in jsonData) {
          nextPageURL = jsonData.pagination ? jsonData.pagination.next_url : null;

          if (jsonData && jsonData.data && jsonData.data.metrics) {
            const processedMetrics = this.processMetricsData(
              nodeName,
              jsonData.data.metrics,
              fields
            );
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
        // Token-refresh on 401: get a fresh token and retry the same URL once.
        if (error.statusCode === HTTP_STATUS.UNAUTHORIZED) {
          const newTokenResponse = await this.getRedditAccessToken(
            this.context.getParameter('ClientId')?.value,
            this.context.getParameter('ClientSecret')?.value,
            this.context.getParameter('RedirectUri')?.value,
            this.context.getParameter('RefreshToken')?.value
          );

          if (newTokenResponse.success && accessTokenParam) {
            accessTokenParam.value = newTokenResponse.accessToken;
            options.headers['Authorization'] = 'Bearer ' + accessTokenParam.value;
            continue;
          }
        }
        throw error;
      }
    }

    this.context.log(
      LOG_LEVEL.INFO,
      `Successfully fetched ${allData.length} records for ${nodeName}`
    );
    return allData;
  }

  /**
   * Retrieves a new Reddit access token using the refresh token.
   */
  async getRedditAccessToken(clientId, clientSecret, redirectUri, refreshToken) {
    const url = 'https://www.reddit.com/api/v1/access_token';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': this.context.getParameter('UserAgent')?.value,
      Authorization: 'Basic ' + CryptoUtils.base64Encode(clientId + ':' + clientSecret),
    };
    const payload = {
      grant_type: 'refresh_token',
      redirect_uri: redirectUri,
      refresh_token: refreshToken,
    };
    const options = {
      method: 'POST',
      headers,
      body: Object.entries(payload)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&'),
    };

    try {
      const response = await fetch(url, options);
      const json = await response.json();

      if (json.error) {
        return { success: false, message: json.error };
      }

      return { success: true, accessToken: json.access_token };
    } catch (e) {
      return { success: false, message: 'Request failed: ' + e.toString() };
    }
  }

  /**
   * Returns configuration map for different API endpoints
   */
  getEndpointsMap() {
    return {
      'ad-account': ({ accountId }) => ({
        url: `ad_accounts/${accountId}`,
        method: 'GET',
      }),
      'ad-account-user': () => ({
        url: 'me',
        method: 'GET',
      }),
      'ad-group': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/ad_groups?page.size=${this.fieldsSchema['ad-group'].parameters.pageSize.default}`,
        method: 'GET',
      }),
      ads: ({ accountId }) => ({
        url: `ad_accounts/${accountId}/ads`,
        method: 'GET',
      }),
      campaigns: ({ accountId }) => ({
        url: `ad_accounts/${accountId}/campaigns`,
        method: 'GET',
      }),
      'user-custom-audience': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/custom_audiences`,
        method: 'GET',
      }),
      'funding-instruments': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/funding_instruments`,
        method: 'GET',
      }),
      'lead-gen-form': ({ accountId }) => ({
        url: `ad_accounts/${accountId}/lead_gen_forms`,
        method: 'GET',
      }),
      report: ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-COUNTRY': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'country'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-AD_GROUP_ID': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'ad_group_id'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-CAMPAIGN_ID': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'campaign_id'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-DMA': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'dma'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-INTEREST': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'interest'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-KEYWORD': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'keyword'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-PLACEMENT': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'placement'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-AD_ACCOUNT_ID': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'AD_ACCOUNT_ID'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
      'report-by-COMMUNITY': ({ accountId, formattedDate, fields }) => ({
        url: `ad_accounts/${accountId}/reports`,
        method: 'POST',
        payload: {
          data: {
            breakdowns: ['date', 'ad_id', 'community'],
            fields: fields,
            starts_at: `${formattedDate}T00:00:00Z`,
            ends_at: `${formattedDate}T00:00:00Z`,
            time_zone_id: 'GMT',
          },
        },
        headersExtension: { 'Content-Type': 'application/json' },
      }),
    };
  }

  processMetricsData(nodeName, metrics, fields = []) {
    for (const key in metrics) {
      const record = metrics[key];
      if (record !== undefined && record !== null) {
        metrics[key] = this.castRecordFields(nodeName, record);
      }
    }
    return this._filterBySchema(metrics, nodeName, fields);
  }

  processRegularData(nodeName, data, fields = []) {
    for (const key in data) {
      const record = data[key];
      if (record !== undefined && record !== null) {
        data[key] = this.castRecordFields(nodeName, record);
      }
    }
    return this._filterBySchema(data, nodeName, fields);
  }

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
   */
  castRecordFields(nodeName, record) {
    if (!record || typeof record !== 'object') {
      return record;
    }

    if (
      !this.fieldsSchema ||
      !this.fieldsSchema[nodeName] ||
      !this.fieldsSchema[nodeName]['fields']
    ) {
      return record;
    }

    for (const field in record) {
      if (
        field in this.fieldsSchema[nodeName]['fields'] &&
        'type' in this.fieldsSchema[nodeName]['fields'][field]
      ) {
        const type = this.fieldsSchema[nodeName]['fields'][field]['type'];
        switch (true) {
          case type === DATA_TYPES.DATE:
            record[field] = new Date(record[field] + 'T00:00:00Z');
            break;
          case type === DATA_TYPES.STRING && (field.endsWith('_id') || field === 'id'):
            record[field] = String(record[field]);
            break;
          case type === DATA_TYPES.NUMBER && field.endsWith('spend'):
            record[field] = parseFloat(record[field]);
            break;
          case type === DATA_TYPES.NUMBER:
            record[field] = parseFloat(record[field]);
            break;
          case type === DATA_TYPES.INTEGER:
            record[field] = parseInt(record[field]);
            break;
          case type === DATA_TYPES.BOOLEAN:
            record[field] = Boolean(record[field]);
            break;
          case type === DATA_TYPES.DATETIME:
            record[field] = new Date(record[field]);
            break;
          case type === DATA_TYPES.TIMESTAMP:
            record[field] = new Date(record[field]);
            break;
        }
      }
    }
    return record;
  }

  /**
   * Determines if a Reddit Ads API error is valid for retry.
   */
  isValidToRetry(error) {
    // One structured entry rather than raw console writes, which the backend
    // splits into a separate run-log entry per line
    this.context.log(LOG_LEVEL.INFO, `Reddit retry check: statusCode=${error.statusCode}`);
    if (error.statusCode && error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
      return true;
    }
    if (error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
      return true;
    }
    if (error.statusCode === HTTP_STATUS.UNAUTHORIZED) {
      return true;
    }
    if (!error.statusCode) {
      return true;
    }
    return false;
  }

  /**
   * Keep only requestedFields plus any schema-required keys.
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

  _filterSingleItem(item, keepFields) {
    const result = {};
    for (const key of Object.keys(item)) {
      if (keepFields.has(key)) {
        result[key] = item[key];
      }
    }
    return result;
  }
}
