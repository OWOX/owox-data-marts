/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var TikTokAdsSource = class TikTokAdsSource extends AbstractSource {

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
                  key: 'OAUTH_TIKTOK_ADS_APP_ID',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED]
                },
                AppSecret: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_TIKTOK_ADS_APP_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED]
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_TIKTOK_ADS_REDIRECT_URI',
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
                description: "TikTok Ads API Access Token for authentication",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
              AppId: {
                requiredType: "string",
                label: "App ID",
                description: "TikTok Ads API Application ID",
              },
              AppSecret: {
                requiredType: "string",
                label: "App Secret",
                description: "TikTok Ads API Application Secret",
                attributes: [CONFIG_ATTRIBUTES.SECRET]
              },
            }
          }
        ]
      },
      AccessToken: {
        requiredType: "string",
        label: "Access Token",
        description: "TikTok Ads API Access Token for authentication",
        attributes: [CONFIG_ATTRIBUTES.SECRET, CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      AppId: {
        requiredType: "string",
        label: "App ID",
        description: "TikTok Ads API Application ID",
        attributes: [CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      AppSecret: {
        requiredType: "string",
        label: "App Secret",
        description: "TikTok Ads API Application Secret",
        attributes: [CONFIG_ATTRIBUTES.SECRET, CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      AdvertiserIDs: {
        isRequired: true,
        label: "Advertiser IDs",
        description: "TikTok Ads Advertiser IDs to fetch data from"
      },
      DataLevel: {
        requiredType: "string",
        default: "AUCTION_AD",
        label: "Data Level",
        description: "Data level for ad_insights reports (AUCTION_ADVERTISER, AUCTION_CAMPAIGN, AUCTION_ADGROUP, AUCTION_AD)",
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
      IncludeDeleted: {
        requiredType: "boolean",
        default: false,
        label: "Include Deleted",
        description: "Include deleted entities in results",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      SandboxMode: {
        requiredType: "boolean",
        default: false,
        label: "Sandbox Mode",
        description: "Use sandbox environment for testing",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API",
        attributes: [CONFIG_ATTRIBUTES.ADVANCED]
      }
    }));

    this.fieldsSchema = TikTokAdsFieldsSchema;
    this.apiVersion = "v1.3"; // TikTok Ads API version

  }

  /**
   * Exchange OAuth authorization code for access and refresh tokens
   * 
   * @param {Object} credentials - OAuth credentials from the authorization flow
   * @param {string} credentials.authCode - Authorization code from TikTok OAuth redirect
   * @param {Object} variables - OAuth configuration variables
   * @param {string} variables.AppId - TikTok App ID
   * @param {string} variables.AppSecret - TikTok App Secret
   * @param {string} variables.RedirectUri - OAuth redirect URI
   * @return {Object} OAuth credentials DTO
   */
  async exchangeOauthCredentials(credentials, variables) {
    try {
      const tokenUrl = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';

      const tokenResponse = await HttpUtils.fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: variables.AppId,
          secret: variables.AppSecret,
          auth_code: credentials.authCode,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenResponse.getAsJson();

      if (tokenData.code !== 0) {
        throw new OauthFlowException({
          message: tokenData.message || 'Failed to exchange authorization code',
          payload: tokenData
        });
      }

      const data = tokenData.data;

      if (!data.access_token) {
        throw new OauthFlowException({
          message: 'Missing access_token in exchange response'
        });
      }

      const provider = new TiktokMarketingApiProvider(
        variables.AppId,
        data.access_token,
        variables.AppSecret,
        false
      );

      let userName = 'TikTok Ads User';
      let userId = 'unknown';
      let advertiserIds = data.advertiser_ids || [];

      try {
        const advertisers = await provider.getAdvertisers(advertiserIds);

        if (advertisers && advertisers.length > 0) {
          userName = advertisers[0].advertiser_name || userName;
          userId = advertisers[0].advertiser_id || userId;

          advertiserIds = advertisers.map(adv => adv.advertiser_id);
        }
      } catch (err) {
        console.warn('Failed to fetch advertiser details during OAuth exchange:', err.message);
        // Fallback to basic data if fetch fails
        if (advertiserIds.length > 0) {
          userId = advertiserIds[0];
        }
      }

      const oauthCredentials = OauthCredentialsDto.builder()
        .withUser({ id: userId, name: userName })
        .withSecret({
          accessToken: data.access_token
        })
        .withExpiresIn(null);

      return oauthCredentials.build().toObject();
    } catch (error) {
      if (error instanceof OauthFlowException) {
        throw error;
      }
      throw new OauthFlowException({
        message: 'Failed to exchange TikTok authorization code',
        payload: error.message
      });
    }
  }

  /**
   * Refresh OAuth credentials when access token is about to expire
   * 
   * @param {Object} configuration - Connector configuration
   * @param {Object} credentials - Stored OAuth credentials
   * @param {Object} variables - OAuth configuration variables
   * @return {Object|null} New OAuth credentials DTO or null if refresh not needed
   */
  async refreshCredentials() {
    return null;
  }

  /**
   * Get access token based on authentication type
   * @return {string} Access token
   * @private
   */
  _getAccessToken() {
    // If using OAuth2, get the access token from AuthType config
    if (this.config.AuthType?.value && this.config.AuthType.value === 'oauth2') {
      return this.config.AuthType.items?.AccessToken?.value;
    }
    // Fallback to legacy AccessToken config
    return this.config.AccessToken?.value;
  }

  /**
   * Get App ID based on authentication type
   * @return {string} App ID
   * @private
   */
  _getAppId() {
    if (this.config.AuthType?.value && this.config.AuthType.value === 'oauth2') {
      return this.config.AuthType.items?.AppId?.value || process.env.OAUTH_TIKTOK_ADS_APP_ID;
    }
    return this.config.AppId?.value || process.env.OAUTH_TIKTOK_ADS_APP_ID;
  }

  /**
   * Get App Secret based on authentication type
   * @return {string} App Secret
   * @private
   */
  _getAppSecret() {
    if (this.config.AuthType?.value && this.config.AuthType.value === 'oauth2') {
      return this.config.AuthType.items?.AppSecret?.value || process.env.OAUTH_TIKTOK_ADS_APP_SECRET;
    }
    return this.config.AppSecret?.value || process.env.OAUTH_TIKTOK_ADS_APP_SECRET;
  }

  /**
   * Get dimensions based on the specified data level
   * 
   * @param {string} dataLevel - The reporting data level
   * @return {array} - Array of dimension fields
   */
  getDimensionsForDataLevel(dataLevel) {
    let dimensions = [];
    switch (dataLevel) {
      case "AUCTION_ADVERTISER":
        dimensions = ["stat_time_day"];
        break;
      case "AUCTION_CAMPAIGN":
        dimensions = ["campaign_id", "stat_time_day"];
        break;
      case "AUCTION_ADGROUP":
        dimensions = ["adgroup_id", "stat_time_day"];
        break;
      case "AUCTION_AD":
      default:
        dimensions = ["ad_id", "stat_time_day"];
        break;
    }
    return dimensions;
  }

  /**
   * Filter and validate metrics for API request
   * 
   * @param {array} filteredFields - All requested fields
   * @param {array} dimensions - Dimension fields to exclude
   * @param {array} validMetricsList - List of valid metrics
   * @return {array} - Filtered valid metric fields
   */
  getFilteredMetrics(filteredFields, dimensions, validMetricsList) {
    const nonMetricFields = [...dimensions, "advertiser_id", "stat_time_day", "date_start", "date_end"];

    return filteredFields
      .filter(field => !nonMetricFields.includes(field))
      .filter(field => validMetricsList.includes(field));
  }

  /**
   * Fetches data from TikTok Ads API
   * 
   * @param {string} nodeName - The node to fetch data from (advertiser, campaigns, ad_groups, ads, ad_insights, audiences)
   * @param {string} advertiserId - The advertiser ID to fetch data for
   * @param {array} fields - Array of field names to fetch
   * @param {Date} startDate - Start date for time-series data (optional)
   * @param {Date} endDate - End date for time-series data (optional)
   * @return {array} - Array of data objects
   */
  async fetchData(nodeName, advertiserId, fields, startDate = null, endDate = null) {
    // Check if the node schema exists
    if (!this.fieldsSchema[nodeName]) {
      throw new Error(`Unknown node type: ${nodeName}`);
    }

    // Validate that required unique fields are included
    if (this.fieldsSchema[nodeName].uniqueKeys) {
      const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys;
      const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

      if (missingKeys.length > 0) {
        throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
      }
    }

    // Initialize the API provider
    const provider = new TiktokMarketingApiProvider(
      this._getAppId(),
      this._getAccessToken(),
      this._getAppSecret(),
      this.config.SandboxMode && this.config.SandboxMode.value
    );

    // Store the current advertiser ID so it can be used if missing in records
    this.currentAdvertiserId = advertiserId;

    let formattedStartDate = null;
    let formattedEndDate = null;

    if (startDate) {
      formattedStartDate = DateUtils.formatDate(startDate);
      // If no end date is provided, use start date as end date (single day)
      formattedEndDate = endDate
        ? DateUtils.formatDate(endDate)
        : formattedStartDate;
    }

    // Filter parameter for including deleted entities
    let filtering = null;
    if (this.config.IncludeDeleted && this.config.IncludeDeleted.value) {
      if (nodeName === 'campaigns') {
        filtering = { "secondary_status": "CAMPAIGN_STATUS_ALL" };
      } else if (nodeName === 'ad_groups') {
        filtering = { "secondary_status": "ADGROUP_STATUS_ALL" };
      } else if (nodeName === 'ads') {
        filtering = { "secondary_status": "AD_STATUS_ALL" };
      }
    }

    // Use schema-defined fields
    let filteredFields = fields;

    // If no fields specified or empty array, use all fields from schema
    if (!fields || fields.length === 0) {
      if (this.fieldsSchema[nodeName] && this.fieldsSchema[nodeName].fields) {
        filteredFields = Object.keys(this.fieldsSchema[nodeName].fields);
      }
    }

    let allData = [];

    try {
      switch (nodeName) {
        case 'advertiser':
          allData = await provider.getAdvertisers(advertiserId);
          break;

        case 'campaigns':
          allData = await provider.getCampaigns(advertiserId, filteredFields, filtering);
          break;

        case 'ad_groups':
          allData = await provider.getAdGroups(advertiserId, filteredFields, filtering);
          break;

        case 'ads':
          allData = await provider.getAds(advertiserId, filteredFields, filtering);
          break;

        case 'ad_insights':
          // Format for ad reporting endpoint
          let dataLevel = this.config.DataLevel && this.config.DataLevel.value ?
            this.config.DataLevel.value : "AUCTION_AD";

          // Validate the data level
          const validDataLevels = ["AUCTION_ADVERTISER", "AUCTION_CAMPAIGN", "AUCTION_ADGROUP", "AUCTION_AD"];
          if (!validDataLevels.includes(dataLevel)) {
            this.config.logMessage(`Invalid data_level: ${dataLevel}. Using default AUCTION_AD.`);
            dataLevel = "AUCTION_AD";
          }

          // Set dimensions based on data level
          let dimensions = this.getDimensionsForDataLevel(dataLevel);

          // Use only metrics that are in our known valid list
          const validMetricsList = provider.getValidAdInsightsMetrics();
          let metricFields = this.getFilteredMetrics(filteredFields, dimensions, validMetricsList);

          allData = await provider.getAdInsights({
            advertiserId: advertiserId,
            dataLevel: dataLevel,
            dimensions: dimensions,
            metrics: metricFields,
            startDate: formattedStartDate,
            endDate: formattedEndDate
          });
          break;

        case 'audiences':
          allData = await provider.getAudiences(advertiserId);
          break;

        default:
          throw new Error(`Endpoint for ${nodeName} is not implemented yet. Feel free to add idea here: https://github.com/OWOX/owox-data-marts/discussions/categories/ideas`);
      }

      // Cast fields to the correct data types using the provider's castFields method
      allData = allData.map(record => this.castFields(nodeName, record, this.fieldsSchema));


      // add missing fields to the record
      for (let field in this.fieldsSchema[nodeName].fields) {
        if (!(field in allData)) {
          allData[field] = null;
        }
      }

      return allData;

    } catch (error) {
      if (error.message.includes('one or more value of the param is not acceptable, correct is')) {
        // Extract the valid fields from the error message
        try {
          const fieldErrorMatch = error.message.match(/correct is \[(.*?)\]/);
          if (fieldErrorMatch && fieldErrorMatch[1]) {
            const validFieldsFromError = fieldErrorMatch[1].split("', '").map(f => f.replace(/'/g, "").trim());

            console.log("API returned valid fields list: " + validFieldsFromError.join(", "));

            // Retry with valid fields from the API
            if (validFieldsFromError.length > 0) {
              console.log("Retrying with valid fields from API");
              return this.fetchData(nodeName, advertiserId, validFieldsFromError, startDate, endDate);
            }
          }
        } catch (parseError) {
          console.error("Error parsing valid fields from error message: " + parseError);
        }
      }

      console.error(`Error fetching data from TikTok Ads API: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cast record fields to the types defined in schema
   * 
   * @param {string} nodeName - Name of the TikTok API node
   * @param {object} record - Object with all the row fields
   * @return {object} - Record with properly cast field values
   */
  castFields(nodeName, record, schema) {
    // Maximum string length to prevent exceeding column limits
    const MAX_STRING_LENGTH = 50000;

    // Special handling for metrics field in ad_insights
    if (nodeName === 'ad_insights') {
      if (record.metrics) {
        // Flatten metrics object into the main record
        for (const metricKey in record.metrics) {
          record[metricKey] = record.metrics[metricKey];
        }
        delete record.metrics;
      }

      if (record.dimensions) {
        // Flatten dimensions object into the main record
        for (const dimensionKey in record.dimensions) {
          record[dimensionKey] = record.dimensions[dimensionKey];
        }
        delete record.dimensions;
      }

      // Ensure advertiser_id is present
      if (!record.advertiser_id && this.currentAdvertiserId) {
        record.advertiser_id = this.currentAdvertiserId;
      }

      // Handle date fields
      if (record.stat_time_day && !record.date_start) {
        record.date_start = record.stat_time_day;
      }
      if (record.date_start && !record.stat_time_day) {
        record.stat_time_day = record.date_start;
      }
    }

    if (nodeName === 'audiences' && !record.advertiser_id && this.currentAdvertiserId) {
      record.advertiser_id = this.currentAdvertiserId;
    }

    // Verify we have a schema for this node
    if (!schema[nodeName] || !schema[nodeName].fields) {
      console.warn(`No schema defined for node ${nodeName}`);
      return record;
    }

    // Filter out any extremely large fields or fields not in schema
    const processedRecord = {};

    // First ensure uniqueKey fields are always included
    if (schema[nodeName].uniqueKeys) {
      for (const keyField of schema[nodeName].uniqueKeys) {
        if (keyField in record) {
          processedRecord[keyField] = record[keyField];
        }
        else if (keyField === 'advertiser_id' && nodeName === 'ad_insights') {
          processedRecord['advertiser_id'] = this.currentAdvertiserId || '';
        }
      }
    }

    // Next add all other fields defined in the schema
    for (let field in schema[nodeName].fields) {
      if (field in record && !processedRecord[field]) {
        processedRecord[field] = record[field];
      }
    }

    // Then add other fields from the record that might be needed
    for (let field in record) {
      if (field === 'rowIndex' && !processedRecord[field]) {
        processedRecord[field] = record[field];
      }
    }

    // Now process field types
    for (let field in processedRecord) {
      if (field in schema[nodeName].fields &&
        "type" in schema[nodeName].fields[field]) {

        let type = schema[nodeName].fields[field].type;
        let value = processedRecord[field];

        if (value === null || value === undefined) {
          continue;
        }

        try {
          switch (type) {
            case DATA_TYPES.STRING:
              processedRecord[field] = String(value).substring(0, MAX_STRING_LENGTH);
              break;

            case DATA_TYPES.INTEGER:
              processedRecord[field] = parseInt(value);
              break;

            case DATA_TYPES.NUMBER:
              processedRecord[field] = parseFloat(value);
              break;

            case DATA_TYPES.BOOLEAN:
              processedRecord[field] = Boolean(value);
              break;

            case DATA_TYPES.DATE:
              let dateValue;
              if (value instanceof Date) {
                dateValue = value;
              } else if (typeof value === 'string') {
                let dateStr = value.replace(' ', 'T');
                if (!dateStr.includes('T')) {
                  dateStr = dateStr + "T00:00:00Z";
                } else if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
                  dateStr = dateStr + "Z";
                }
                dateValue = new Date(dateStr);
              } else {
                dateValue = new Date(value);
              }

              processedRecord[field] = dateValue;
              break;

            case DATA_TYPES.DATETIME:
              let datetimeValue;
              if (field === 'create_time' || field === 'modify_time') {
                if (typeof value === 'number') {
                  datetimeValue = new Date(parseInt(value) * 1000);
                } else if (typeof value === 'string') {
                  datetimeValue = new Date(value);
                } else {
                  datetimeValue = new Date(value);
                }
              } else {
                datetimeValue = new Date(value);
              }
              processedRecord[field] = datetimeValue;
              break;

            case DATA_TYPES.TIMESTAMP:
              processedRecord[field] = new Date(value);
              break;

            case DATA_TYPES.OBJECT:
            case DATA_TYPES.ARRAY:
              try {
                const jsonStr = JSON.stringify(value);
                processedRecord[field] = jsonStr.substring(0, MAX_STRING_LENGTH);
              } catch (error) {
                processedRecord[field] = String(value).substring(0, MAX_STRING_LENGTH);
              }
              break;

            default:
              console.warn(`Unknown type ${type} for field ${field}`);
              processedRecord[field] = String(value).substring(0, MAX_STRING_LENGTH);
              break;
          }
        } catch (error) {
          console.error(`Error processing field ${field} with value ${value}: ${error.message}`);
          processedRecord[field] = "[Error processing value]";
        }
      } else if (field !== 'rowIndex') {
        console.debug(`Field ${field} in ${nodeName} is not defined in schema`);
        if (processedRecord[field] !== null && processedRecord[field] !== undefined) {
          try {
            processedRecord[field] = String(processedRecord[field]).substring(0, MAX_STRING_LENGTH);
          } catch (error) {
            processedRecord[field] = "[Error processing value]";
          }
        }
      }
    }

    return processedRecord;
  }

};
