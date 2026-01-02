/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/* eslint-disable no-unused-vars, no-undef */
var FacebookMarketingSource = class FacebookMarketingSource extends AbstractSource {

  //---- constructor -------------------------------------------------
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
                AppId: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_FACEBOOK_MARKETING_APP_ID',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED]
                },
                AppSecret: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_FACEBOOK_MARKETING_APP_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED]
                },
                Scopes: {
                  type: 'string',
                  store: 'env',
                  key: 'OAUTH_FACEBOOK_MARKETING_SCOPE',
                  default: 'ads_read,ads_management',
                  attributes: [OAUTH_CONSTANTS.UI]
                }
              },
              mapping: {
                AccessToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'accessToken'
                }
              }
            },
            items: {
              AccessToken: {
                isRequired: true,
                requiredType: "string",
                label: "Access Token",
                description: "Facebook API Access Token for authentication",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
              AppId: {
                requiredType: "string",
                label: "App ID",
                description: "Facebook API App ID for exchange token",
              },
              AppSecret: {
                requiredType: "string",
                label: "App Secret",
                description: "Facebook API App Secret for exchange token",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
            }
          }
        ]
      },
      AccessToken: {
        requiredType: "string",
        label: "Access Token",
        description: "Facebook API Access Token for authentication",
        attributes: [CONFIG_ATTRIBUTES.SECRET, CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      AccountIDs: {
        isRequired: true,
        label: "Account IDs",
        description: "Facebook Ad Account IDs to fetch data from"
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
        description: "List of fields to fetch from Facebook API"
      },
      ProcessShortLinks: {
        requiredType: "boolean",
        default: true,
        label: "Process Short Links",
        description: "Enable automatic processing of short links in link_url_asset field. Only available for ad-account/insights-by-link-url-asset endpoint as it requires breakdown by link_url_asset",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API (true/false)",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
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
      }
    }));

    this.fieldsSchema = FacebookMarketingFieldsSchema;

  }

  async exchangeOauthCredentials(credentials, variables) {
    try {
      const debugUrl = new URL('https://graph.facebook.com/debug_token');
      debugUrl.searchParams.set('input_token', credentials.accessToken);
      debugUrl.searchParams.set('access_token', `${variables.AppId}|${variables.AppSecret}`);
      const debugResponse = await HttpUtils.fetch(debugUrl.toString());
      const debugData = await debugResponse.getAsJson();

      if (!debugData.data?.is_valid) {
        throw new OauthFlowException({ message: 'Invalid token', payload: debugData.data?.error?.message });
      }

      const exchangeUrl = new URL('https://graph.facebook.com/v23.0/oauth/access_token');
      exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
      exchangeUrl.searchParams.set('client_id', variables.AppId);
      exchangeUrl.searchParams.set('client_secret', variables.AppSecret);
      exchangeUrl.searchParams.set('fb_exchange_token', credentials.accessToken);
      const longLivedResponse = await HttpUtils.fetch(exchangeUrl.toString());
      const longLivedData = await longLivedResponse.getAsJson();

      if (longLivedData.error) {
        throw new OauthFlowException({
          message: 'Failed to exchange token',
          payload: longLivedData.error.message
        });
      }

      if (!longLivedData.access_token) {
        throw new OauthFlowException({
          message: 'Missing access_token in exchange response'
        });
      }

      const userInfoUrl = new URL('https://graph.facebook.com/v23.0/me');
      userInfoUrl.searchParams.set('fields', 'id,name');
      userInfoUrl.searchParams.set('access_token', longLivedData.access_token);
      const userInfo = await HttpUtils.fetch(userInfoUrl.toString());
      const userInfoData = await userInfo.getAsJson();

      const expiresIn = longLivedData.expires_in ?? (60 * 60 * 24 * 60);
      const oauthCredentials = OauthCredentialsDto.builder()
        .withUser({ id: userInfoData.id, name: userInfoData.name })
        .withSecret({ accessToken: longLivedData.access_token })
        .withExpiresIn(expiresIn);

      const adAccountsUrl = new URL('https://graph.facebook.com/v23.0/me/adaccounts');
      adAccountsUrl.searchParams.set('fields', 'id,name,account_status');
      adAccountsUrl.searchParams.set('access_token', longLivedData.access_token);
      const adAccountsResponse = await HttpUtils.fetch(adAccountsUrl.toString());
      const adAccountsData = await adAccountsResponse.getAsJson();

      if (adAccountsData.error) {
        oauthCredentials.withWarnings([adAccountsData.error.message]);
      } else {
        oauthCredentials.withAdditional({ adAccounts: adAccountsData });
      }
      return oauthCredentials.build().toObject();
    } catch (error) {
      if (error instanceof OauthFlowException) {
        throw error;
      }
      throw new OauthFlowException({ message: 'Failed to exchange Facebook tokens', payload: error.message });
    }
  }

  async refreshCredentials(configuration, credentials, variables) {
    const authTypeConfig = configuration.AuthType || {};
    const isOAuth2 = 'oauth2' in authTypeConfig;

    if (!isOAuth2) {
      return null;
    }

    const oauthConfig = authTypeConfig.oauth2 || {};
    const hasStoredCredential = OAUTH_SOURCE_CREDENTIALS_KEY in oauthConfig && oauthConfig[OAUTH_SOURCE_CREDENTIALS_KEY];

    if (hasStoredCredential) {
      const fiveDaysFromNow = Date.now() + 5 * 24 * 60 * 60 * 1000;
      if (credentials.expiresAt && credentials.expiresAt < fiveDaysFromNow) {
        const storedCredentials = { accessToken: credentials.secret?.accessToken };
        return this.exchangeOauthCredentials(storedCredentials, variables);
      } else {
        return null;
      }
    } else {
      const accessToken = oauthConfig.AccessToken;
      const appId = oauthConfig.AppId;
      const appSecret = oauthConfig.AppSecret;

      if (!accessToken || !appId || !appSecret) {
        return null;
      }

      const manualCredentials = { accessToken };
      const manualVariables = { AppId: appId, AppSecret: appSecret };
      return this.exchangeOauthCredentials(manualCredentials, manualVariables);
    }
  }

  //---- isValidToRetry ----------------------------------------------
  /**
   * Determines if a Facebook API error is valid for retry
   * Based on Facebook error codes
   *
   * @param {HttpRequestException} error - The error to check
   * @return {boolean} True if the error should trigger a retry, false otherwise
   */
  isValidToRetry(error) {
    console.log(`isValidToRetry() called`);
    console.log(`error.statusCode =`, error.statusCode);

    if (error.statusCode && error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
      return true;
    }

    if (!error.payload || !error.payload.error) {
      return false;
    }

    const fbErr = error.payload.error;
    const code = Number(fbErr.code);
    const subcode = Number(fbErr.error_subcode);

    console.log(`FB error.code = ${code}`);
    console.log(`FB error.error_subcode = ${subcode}`);
    console.log(`is_transient = ${fbErr.is_transient}`);
    console.log(`code in retry list = ${FB_RETRYABLE_ERROR_CODES.includes(code)}`);
    console.log(`subcode in retry list = ${FB_RETRYABLE_ERROR_CODES.includes(subcode)}`);

    return fbErr.is_transient === true
      || FB_RETRYABLE_ERROR_CODES.includes(code)
      || FB_RETRYABLE_ERROR_CODES.includes(subcode);
  }

  //---- fetchData -------------------------------------------------
  /*
  @param nodeName string
  @param accountId string
  @param fields array
  @param startDate date

  @return data array

  */
  async fetchData(nodeName, accountId, fields, startDate = null) {

    //console.log(`Fetching data from ${nodeName}/${accountId}/${fields} for ${startDate}`);

    let url = 'https://graph.facebook.com/v23.0/';

    let formattedDate = null;
    let timeRange = null;

    if (startDate) {
      formattedDate = DateUtils.formatDate(startDate);
      timeRange = encodeURIComponent(JSON.stringify({ since: formattedDate, until: formattedDate }));
    }

    switch (nodeName) {
      case 'ad-account':
        url += `act_${accountId}?fields=${fields.join(",")}`;
        break;

      case 'ad-account-user':
        url += `act_${accountId}/?fields=${fields.join(",")}`;
        break;

      case 'ad-account/ads':
        url += `act_${accountId}/ads?limit=${this.fieldsSchema[nodeName].limit}`;
        break;

      case 'ad-account/adcreatives':
        url += `act_${accountId}/adcreatives?fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
        break;

      case 'ad-account/insights':
      case 'ad-account/insights-by-country':
      case 'ad-account/insights-by-link-url-asset':
      case 'ad-account/insights-by-publisher-platform-and-position':
      case 'ad-account/insights-by-device-platform':
      case 'ad-account/insights-by-region':
      case 'ad-account/insights-by-product-id':
      case 'ad-account/insights-by-age-and-gender':
        return await this._fetchInsightsData({ nodeName, accountId, fields, timeRange, url });

      case 'ad-group':
        url += `act_${accountId}/ads?fields=${this._buildFieldsString({ nodeName, fields })}&limit=${this.fieldsSchema[nodeName].limit}`;
        break;

      default:
        throw new Error(`End point for ${nodeName} is not implemented yet. Feel free add idea here: https://github.com/OWOX/owox-data-marts/discussions/categories/ideas`);
    }

    console.log(`Facebook API URL:`, url);

    url += `&access_token=${this._getAccessToken()}`;

    return await this._fetchPaginatedData(url, nodeName, fields);

  }


  //---- castRecordFields -------------------------------------------------
    /**
     * Cast of record fields to the types defined in schema
     * 
     * @param nodeName string name of the facebook api node
     * @param record object with all the row fields
     * 
     * @return record
     * 
     */
    castRecordFields(nodeName, record) {

      for (var field in record) {
        if( field in this.fieldsSchema[ nodeName ]["fields"]
        && "type" in this.fieldsSchema[ nodeName ]["fields"][field] ) {

          let type = this.fieldsSchema[ nodeName ]["fields"][field]["type"];

          switch ( true ) {

            case type == DATA_TYPES.DATE:
            record[field] = DateUtils.parseDate(record[field] ? record[field] + "T00:00:00Z" : null);
              break;

            case type == DATA_TYPES.STRING && ( field.slice(-3) == "_id" || field == "id" ):
              record[ field ] = String(record[ field ]);
              break;

            case type == DATA_TYPES.NUMBER && ( field.slice(-5) == "spend"  ):
              record[ field ] = parseFloat(record[ field ]);
              break;

            case type == DATA_TYPES.NUMBER:
            record[field] = parseFloat(record[ field ]);
              break;

            case type == DATA_TYPES.INTEGER:
              record[ field ] = parseInt(record[ field ]);
              break;

            case type == DATA_TYPES.BOOLEAN:
              record[ field ] = Boolean(record[ field ]);
              break;

            case type == DATA_TYPES.DATETIME:
            record[field] = DateUtils.parseDate(record[ field ]);
              break;

            case type == DATA_TYPES.TIMESTAMP:
            record[field] = new Date(record[ field ]);
              break;
          }
        }
      }

      return record;
    }
    
  //---- _fetchInsightsData ------------------------------------------------
  /**
   * Fetch insights data with breakdown support
   *
   * @param {Object} params - Parameters object
   * @param {string} params.nodeName - Node name
   * @param {string} params.accountId - Account ID
   * @param {Array} params.fields - Fields to fetch
   * @param {string} params.timeRange - Time range parameter
   * @param {string} params.url - Base URL
   * @return {Array} Processed insights data
   * @private
   */
  async _fetchInsightsData({ nodeName, accountId, fields, timeRange, url }) {
    const breakdowns = this.fieldsSchema[nodeName].breakdowns || [];
    const regularFields = this._prepareFields({ nodeName, fields, breakdowns });

    const requestUrl = this._buildInsightsUrl({
      accountId,
      fields: regularFields,
      breakdowns,
      timeRange,
      nodeName,
      url
    });

    const allData = await this._fetchPaginatedData(requestUrl, nodeName, fields);

    // Process short links if link_url_asset data is present
    if (this.config.ProcessShortLinks.value && allData.length > 0 && allData.some(record => record.link_url_asset)) {
      return processShortLinks(allData, {
        shortLinkField: 'link_url_asset',
        urlFieldName: 'website_url'
      });
    }

    return allData;
  }

  _getAccessToken() {
    // if oauth2, use the entered access token
    if (this.config.AuthType.value && this.config.AuthType.value === 'oauth2') {
      return this.config.AuthType.items?.AccessToken?.value;
    }
    return this.config.AccessToken.value;
  }

  //---- _prepareFields --------------------------------------
  /**
   * Filter and prepare fields for API request
   * Filters out fields that don't exist in schema and removes breakdown fields
   * Breakdowns are passed separately in &breakdowns= parameter, not in &fields=
   *
   * @param {Object} params - Parameters object
   * @param {string} params.nodeName - Node name
   * @param {Array} params.fields - All fields
   * @param {Array} params.breakdowns - Breakdown fields to exclude
   * @return {Array} Regular fields ready for API request
   * @private
   */
  _prepareFields({ nodeName, fields, breakdowns }) {
    return fields.filter(field =>
      this.fieldsSchema[nodeName].fields[field] && !breakdowns.includes(field)
    );
  }

  //---- _buildInsightsUrl ------------------------------------------------
  /**
   * Build insights URL for request
   *
   * @param {Object} params - Parameters object
   * @param {string} params.accountId - Account ID
   * @param {Array} params.fields - Fields to fetch
   * @param {Array} params.breakdowns - Breakdown fields
   * @param {string} params.timeRange - Time range
   * @param {string} params.nodeName - Node name
   * @param {string} params.url - Base URL
   * @return {string} Complete URL
   * @private
   */
  _buildInsightsUrl({ accountId, fields, breakdowns, timeRange, nodeName, url }) {
    console.log('Insights request fields for', nodeName, ':', fields);
    let insightsUrl = `${url}act_${accountId}/insights?level=ad&period=day&time_range=${timeRange}&fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
    if (breakdowns.length > 0) {
      insightsUrl += `&breakdowns=${breakdowns.join(",")}`;
    }

    console.log(`Facebook API URL:`, insightsUrl);

    insightsUrl += `&access_token=${this._getAccessToken()}`;
    return insightsUrl;
  }

  //---- _buildFieldsString ------------------------------------------------
  /**
   * Build fields string for Facebook API request
   * Filters out fields that don't exist in schema
   * Handles nested fields using Facebook's syntax: parent{field1,field2}
   *
   * @param {Object} params - Parameters object
   * @param {string} params.nodeName - Node name
   * @param {Array} params.fields - Fields to fetch
   * @return {string} Fields string for API request
   * @private
   */
  _buildFieldsString({ nodeName, fields }) {
    const nestedFields = {}; // e.g. { creative: ['id', 'name', 'url_tags'] }
    const regularFields = [];
    const skippedFields = [];

    // First, filter fields that exist in schema
    for (const field of fields) {
      const fieldConfig = this.fieldsSchema[nodeName].fields[field];

      // Skip fields that don't exist in schema
      if (!fieldConfig) {
        skippedFields.push(field);
        continue;
      }

      // Check if field has nested structure (apiName with dot notation)
      if (fieldConfig.apiName && fieldConfig.apiName.includes('.')) {
        const [parent, ...childParts] = fieldConfig.apiName.split('.');
        const child = childParts.join('.');

        if (!nestedFields[parent]) {
          nestedFields[parent] = [];
        }
        nestedFields[parent].push(child);
      } else {
        regularFields.push(field);
      }
    }

    // Log skipped fields for debugging
    if (skippedFields.length > 0) {
      console.log(`Skipped fields not found in ${nodeName} schema:`, skippedFields.join(', '));
    }

    // Build final fields array
    const finalFields = [...regularFields];

    // Add nested fields in format: parent{field1,field2}
    for (const [parent, children] of Object.entries(nestedFields)) {
      finalFields.push(`${parent}{${children.join(',')}}`);
    }

    return finalFields.join(',');
  }

  //---- _mapResultToColumns -----------------------------------------------
  /**
   * Map API result to requested column names
   * Only includes fields that exist in schema and were requested
   * Handles nested fields using apiName mapping
   *
   * @param {Object} result - API response result
   * @param {string} nodeName - Node name for schema lookup
   * @param {Array<string>} requestedFields - Fields that were requested
   * @return {Object} Mapped result with only requested columns
   * @private
   */
  _mapResultToColumns(result, nodeName, requestedFields) {
    const mapped = {};

    for (const fieldName of requestedFields) {
      const fieldConfig = this.fieldsSchema[nodeName].fields[fieldName];

      if (!fieldConfig) {
        continue;
      }

      // Check if field has nested structure (apiName)
      if (fieldConfig.apiName) {
        // Get value from nested API response (e.g. creative.id)
        mapped[fieldName] = this._getNestedValue(result, fieldConfig.apiName);
      } else {
        // Regular field - get directly from result
        mapped[fieldName] = result[fieldName];
      }
    }

    return mapped;
  }

  //---- _getNestedValue ---------------------------------------------------
  /**
   * Get nested value from object using dot-notation path
   * @param {Object} obj - Object to search in
   * @param {string} path - Dot-notation path (e.g. 'creative.id')
   * @return {*} Value at path or undefined
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  //---- _fetchPaginatedData -----------------------------------------------
  /**
   * Fetch paginated data from Facebook API
   *
   * @param {string} initialUrl - Initial URL to fetch
   * @param {string} nodeName - Node name for field casting
   * @param {Array} fields - Fields that were requested
   * @return {Array} All fetched data
   * @private
   */
  async _fetchPaginatedData(initialUrl, nodeName, fields) {
    var allData = [];
    var nextPageURL = initialUrl;

    while (nextPageURL) {
      // Fetch data from the JSON URL
      var response = await this.urlFetchWithRetry(nextPageURL);
      var text = await response.getContentText();
      var jsonData = JSON.parse(text);

      // This node point returns a result in the data property, which might be paginated
      if ("data" in jsonData) {

        nextPageURL = jsonData.paging ? jsonData.paging.next : null;
        //nextPageURL = null;

        jsonData.data.forEach((record, index) => {
          // Map to requested columns only (excludes unwanted nested objects)
          let mappedRecord = this._mapResultToColumns(record, nodeName, fields);
          // Then cast fields to proper types
          mappedRecord = this.castRecordFields(nodeName, mappedRecord);
          jsonData.data[index] = mappedRecord;
        });

        allData = allData.concat(jsonData.data);

        // this is non-paginated result
      } else {
        nextPageURL = null;
        for (var key in jsonData) {
          jsonData[key] = this.castRecordFields(nodeName, jsonData[key]);
        }
        allData = allData.concat(jsonData);
      }
      console.log(`Got ${allData.length} records`);

    }
    //console.log(allData);
    return allData;
  }

}
