/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

const TIKTOK_ADS_DATA_LEVELS = [
  'AUCTION_ADVERTISER',
  'AUCTION_CAMPAIGN',
  'AUCTION_ADGROUP',
  'AUCTION_AD',
];

export class TikTokAdsSource extends AbstractSource {
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
                AppId: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_TIKTOK_ADS_APP_ID',
                  attributes: [
                    OAUTH_CONSTANTS.UI,
                    OAUTH_CONSTANTS.SECRET,
                    OAUTH_CONSTANTS.REQUIRED,
                  ],
                },
                AppSecret: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_TIKTOK_ADS_APP_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED],
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_TIKTOK_ADS_REDIRECT_URI',
                  attributes: [OAUTH_CONSTANTS.UI],
                },
              },
              mapping: {
                AccessToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'accessToken',
                },
              },
            },
            items: {
              AccessToken: {
                isRequired: true,
                requiredType: 'string',
                label: 'Access Token',
                description: 'TikTok Ads API Access Token for authentication',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              AppId: {
                requiredType: 'string',
                label: 'App ID',
                description: 'TikTok Ads API Application ID',
              },
              AppSecret: {
                requiredType: 'string',
                label: 'App Secret',
                description: 'TikTok Ads API Application Secret',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
            },
          },
        ],
      },
      AccessToken: {
        requiredType: 'string',
        label: 'Access Token',
        description: 'TikTok Ads API Access Token for authentication',
        attributes: [
          CONFIG_ATTRIBUTES.SECRET,
          CONFIG_ATTRIBUTES.DEPRECATED,
          CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM,
        ],
      },
      AppId: {
        requiredType: 'string',
        label: 'App ID',
        description: 'TikTok Ads API Application ID',
        attributes: [CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      AppSecret: {
        requiredType: 'string',
        label: 'App Secret',
        description: 'TikTok Ads API Application Secret',
        attributes: [
          CONFIG_ATTRIBUTES.SECRET,
          CONFIG_ATTRIBUTES.DEPRECATED,
          CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM,
        ],
      },
      AdvertiserIDs: {
        isRequired: true,
        label: 'Advertiser IDs',
        description: 'TikTok Ads Advertiser IDs to fetch data from',
      },
      DataLevel: {
        requiredType: 'string',
        default: 'AUCTION_AD',
        label: 'Data Level',
        description:
          'Data level for ad_insights reports. Switching levels after data exists can corrupt merges — use a new table in another Data Mart instead.',
        options: TIKTOK_ADS_DATA_LEVELS,
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
      IncludeDeleted: {
        requiredType: 'boolean',
        default: false,
        label: 'Include Deleted',
        description: 'Include deleted entities in results',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      SandboxMode: {
        requiredType: 'boolean',
        default: false,
        label: 'Sandbox Mode',
        description: 'Use sandbox environment for testing',
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

    this.fieldsSchema = TikTokAdsFieldsSchema;
    this.apiVersion = 'v1.3';

    // Per-advertiser tracking for onImportComplete error aggregation.
    // Mirrors the legacy Connector.js _checkAndReportErrors() behavior so that
    // partial failures emit a warning while a total wipeout (every advertiser
    // failed) still throws and triggers ControlEvent failed.
    this.advertiserErrors = new Map(); // advertiserId -> [errors]
    this.advertiserSuccesses = new Map(); // advertiserId -> boolean
  }

  /**
   * Parse comma/semicolon-separated AdvertiserIDs into [{ id }, ...].
   */
  getAccounts(context) {
    const advertiserIdsParam = context.getParameter('AdvertiserIDs');
    if (!advertiserIdsParam?.value) return [null];
    return TikTokAdsHelper.parseAdvertiserIds(advertiserIdsParam.value).map(id => ({ id }));
  }

  /**
   * Parse "node1 fieldA, node1 fieldB, ..." → { node1: ['fieldA', 'fieldB'] }.
   */
  parseFields(context) {
    const fieldsValue = context.getParameter('Fields')?.value;
    if (!fieldsValue) return {};
    return TikTokAdsHelper.parseFields(fieldsValue);
  }

  /**
   * TikTok ad_insights queries take start_date/end_date of the same day — fetch one day per call.
   */
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.DAY_BY_DAY;
  }

  /**
   * Track that this advertiser had at least one successful fetch.
   * Called by the host AbstractConnector after each fetch completes — but
   * AbstractConnector doesn't currently expose per-fetch success hooks. We
   * therefore mark on-success inline in fetchData() and on-failure via
   * onAccountError() (which the connector calls when an account-level loop
   * throws). For partial-success tracking within an account, we mark
   * `successes[id] = true` whenever fetchData() returns without throwing.
   */
  onAccountError(account, error) {
    if (!account?.id) return;
    if (!this.advertiserErrors.has(account.id)) {
      this.advertiserErrors.set(account.id, []);
    }
    this.advertiserErrors.get(account.id).push(error);
  }

  /**
   * Aggregate post-import status. Equivalent to legacy _checkAndReportErrors() +
   * cleanUpExpiredData(): if every advertiser failed → throw (escalates to
   * ControlEvent failed via AbstractConnector); if some failed → emit warn log;
   * if all OK → silent.
   */
  onImportComplete(context) {
    // Cleanup hook — preserved as no-op shape for parity with legacy behavior.
    // Original implementation only logged for now (cleanup is not actually
    // wired to current storages); we keep it as a placeholder.
    this._cleanUpExpiredData(context);

    const advertiserIds = this.getAccounts(context)
      .map(a => a?.id)
      .filter(Boolean);
    const total = advertiserIds.length;
    if (total === 0) return;

    const failed = [];
    const succeeded = [];

    for (const id of advertiserIds) {
      const hasErrors = this.advertiserErrors.has(id) && this.advertiserErrors.get(id).length > 0;
      const hasSuccess = this.advertiserSuccesses.get(id) === true;

      if (hasErrors && !hasSuccess) {
        failed.push(id);
      } else {
        succeeded.push(id);
      }
    }

    if (failed.length === total) {
      const messages = failed.map(id => {
        const errs = this.advertiserErrors.get(id) || [];
        return errs[0] ? `Advertiser ${id}: ${errs[0].message}` : `Advertiser ${id}`;
      });
      throw new Error(`All advertisers failed to import data. Errors: ${messages.join('; ')}`);
    }

    if (failed.length > 0 && succeeded.length > 0) {
      context.log(
        LOG_LEVEL.WARN,
        `Warning: ${failed.length} out of ${total} advertisers had errors. ` +
          `Failed advertisers: ${failed.join(', ')}. ` +
          `Successful advertisers: ${succeeded.join(', ')}`
      );
    }
  }

  /**
   * Cleanup window placeholder. Legacy implementation iterated time-series nodes
   * but only emitted a log message (no actual deletion was wired). Kept for
   * behavioral parity.
   * @private
   */
  _cleanUpExpiredData(context) {
    const param = context.getParameter('CleanUpToKeepWindow');
    if (!param?.value) return;
    const keepDays = parseInt(param.value, 10);
    if (isNaN(keepDays) || keepDays <= 0) return;
    context.log(LOG_LEVEL.INFO, `Cleaning up data older than ${keepDays} days...`);
  }

  /**
   * Exchange OAuth authorization code for an access token.
   */
  async exchangeOauthCredentials(credentials, variables) {
    try {
      const tokenUrl = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: variables.AppId,
          secret: variables.AppSecret,
          auth_code: credentials.authCode,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.code !== 0) {
        throw new OauthFlowException({
          message: tokenData.message || 'Failed to exchange authorization code',
          payload: tokenData,
        });
      }

      const data = tokenData.data;

      if (!data.access_token) {
        throw new OauthFlowException({ message: 'Missing access_token in exchange response' });
      }

      const provider = new TiktokMarketingApiProvider(
        variables.AppId,
        data.access_token,
        variables.AppSecret,
        false,
        this.context
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
        if (advertiserIds.length > 0) {
          userId = advertiserIds[0];
        }
      }

      const oauthCredentials = OauthCredentialsDto.builder()
        .withUser({ id: userId, name: userName })
        .withSecret({ accessToken: data.access_token })
        .withExpiresIn(null);

      return oauthCredentials.build().toObject();
    } catch (error) {
      if (error instanceof OauthFlowException) {
        throw error;
      }
      throw new OauthFlowException({
        message: 'Failed to exchange TikTok authorization code',
        payload: error.message,
      });
    }
  }

  async refreshCredentials() {
    return null;
  }

  /**
   * Get access token based on auth type.
   * @private
   */
  _getAccessToken() {
    const authType = this.context.getParameter('AuthType');
    if (authType?.value === 'oauth2') {
      return authType.items?.AccessToken?.value;
    }
    return this.context.getParameter('AccessToken')?.value;
  }

  /**
   * Get App ID based on auth type.
   * @private
   */
  _getAppId() {
    const authType = this.context.getParameter('AuthType');
    if (authType?.value === 'oauth2') {
      return authType.items?.AppId?.value || process.env.OAUTH_TIKTOK_ADS_APP_ID;
    }
    return this.context.getParameter('AppId')?.value || process.env.OAUTH_TIKTOK_ADS_APP_ID;
  }

  /**
   * Get App Secret based on auth type.
   * @private
   */
  _getAppSecret() {
    const authType = this.context.getParameter('AuthType');
    if (authType?.value === 'oauth2') {
      return authType.items?.AppSecret?.value || process.env.OAUTH_TIKTOK_ADS_APP_SECRET;
    }
    return this.context.getParameter('AppSecret')?.value || process.env.OAUTH_TIKTOK_ADS_APP_SECRET;
  }

  /**
   * Validate the configured DataLevel; fall back to AUCTION_AD on bad input.
   */
  getValidatedDataLevel() {
    let dataLevel = this.context.getParameter('DataLevel')?.value || 'AUCTION_AD';

    if (!TIKTOK_ADS_DATA_LEVELS.includes(dataLevel)) {
      this.context.log(
        LOG_LEVEL.WARN,
        `Invalid data_level: ${dataLevel}. Using default AUCTION_AD.`
      );
      dataLevel = 'AUCTION_AD';
    }
    return dataLevel;
  }

  /**
   * Get dimensions based on the specified data level.
   */
  getDimensionsForDataLevel(dataLevel) {
    switch (dataLevel) {
      case 'AUCTION_ADVERTISER':
        return ['stat_time_day'];
      case 'AUCTION_CAMPAIGN':
        return ['campaign_id', 'stat_time_day'];
      case 'AUCTION_ADGROUP':
        return ['adgroup_id', 'stat_time_day'];
      case 'AUCTION_AD':
      default:
        return ['ad_id', 'stat_time_day'];
    }
  }

  /**
   * Append a new dimension to an existing dimensions array (de-duplicated).
   */
  populateDimensions(dimensions, newDimension) {
    if (!dimensions.includes(newDimension)) {
      return [...dimensions, newDimension];
    }
    return dimensions;
  }

  /**
   * Get unique key fields for a node, accounting for data-level dependent dimensions.
   *
   * advertiser_id is always included for the insights nodes: AdvertiserIDs can list
   * several advertisers that all write into the same destination table (one storage
   * instance is cached per node in Connector.js), and at AUCTION_ADVERTISER there is no
   * other dimension to tell two advertisers' same-day rows apart, so the MERGE key would
   * collide across advertisers without it. campaign_id/adgroup_id/ad_id are unique
   * platform-wide, so this is a no-op (redundant-but-harmless) at the other data levels.
   *
   * @param {string} nodeName - The node name (e.g. ad_insights, ad_insights_by_country)
   * @param {string} dataLevel - The reporting data level (only relevant for insights nodes)
   * @return {array} - Array of unique key fields
   */
  getUniqueKeysForNode(nodeName, dataLevel) {
    if (nodeName === 'ad_insights') {
      return this.populateDimensions(this.getDimensionsForDataLevel(dataLevel), 'advertiser_id');
    }
    if (nodeName === 'ad_insights_by_country') {
      const dimensions = this.populateDimensions(
        this.getDimensionsForDataLevel(dataLevel),
        'country_code'
      );
      return this.populateDimensions(dimensions, 'advertiser_id');
    }
    return this.fieldsSchema[nodeName]?.uniqueKeys ?? [];
  }

  /**
   * Get fields schema, adding a uniqueKeysByDataLevel map to insights nodes so the
   * config UI can pin the correct fields for whichever DataLevel the user picks
   * (e.g. AUCTION_ADVERTISER doesn't require ad_id, only AUCTION_AD does). Reuses
   * getUniqueKeysForNode so the UI can never drift from the actual merge/validation keys.
   *
   * @return {object} - Fields schema, keyed by node name
   */
  getFieldsSchema() {
    const schema = super.getFieldsSchema();

    for (const nodeName of ['ad_insights', 'ad_insights_by_country']) {
      if (!schema[nodeName]) continue;

      const uniqueKeysByDataLevel = {};
      for (const level of TIKTOK_ADS_DATA_LEVELS) {
        uniqueKeysByDataLevel[level] = this.getUniqueKeysForNode(nodeName, level);
      }
      schema[nodeName] = { ...schema[nodeName], uniqueKeysByDataLevel };
    }

    return schema;
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
    const nonMetricFields = [
      ...dimensions,
      'advertiser_id',
      'stat_time_day',
      'date_start',
      'date_end',
    ];
    return filteredFields
      .filter(field => !nonMetricFields.includes(field))
      .filter(field => validMetricsList.includes(field));
  }

  /**
   * Single fetch entry point. AbstractConnector calls us with
   * { nodeName, fields, accountId, startDate, endDate } once per
   * (advertiser × node × day) for time-series, or once per
   * (advertiser × node) for catalog. Under day-by-day, startDate === endDate.
   */
  async fetchData({ nodeName, accountId, fields = [], startDate = null, endDate = null }) {
    const advertiserId = accountId;

    if (!this.fieldsSchema[nodeName]) {
      throw new Error(`Unknown node type: ${nodeName}`);
    }

    if (this.fieldsSchema[nodeName].uniqueKeys) {
      const isInsightsNode = nodeName === 'ad_insights' || nodeName === 'ad_insights_by_country';
      const nodeDataLevel = isInsightsNode ? this.getValidatedDataLevel() : null;
      const uniqueKeys = this.getUniqueKeysForNode(nodeName, nodeDataLevel);
      const missingKeys = uniqueKeys.filter(
        key => !(isInsightsNode && key === 'advertiser_id') && !fields.includes(key)
      );

      if (missingKeys.length > 0) {
        throw new Error(
          `Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`
        );
      }
    }

    const sandboxMode = this.context.getParameter('SandboxMode')?.value === true;

    const provider = new TiktokMarketingApiProvider(
      this._getAppId(),
      this._getAccessToken(),
      this._getAppSecret(),
      sandboxMode,
      this.context
    );

    // Store the current advertiser ID so castFields can patch missing values
    this.currentAdvertiserId = advertiserId;

    // Filter parameter for including deleted entities
    let filtering = null;
    if (this.context.getParameter('IncludeDeleted')?.value) {
      if (nodeName === 'campaigns') {
        filtering = { secondary_status: 'CAMPAIGN_STATUS_ALL' };
      } else if (nodeName === 'ad_groups') {
        filtering = { secondary_status: 'ADGROUP_STATUS_ALL' };
      } else if (nodeName === 'ads') {
        filtering = { secondary_status: 'AD_STATUS_ALL' };
      }
    }

    let filteredFields = fields;
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

        case 'ad_insights': {
          const dataLevel = this.getValidatedDataLevel();
          const dimensions = this.getDimensionsForDataLevel(dataLevel);
          const validMetricsList = provider.getValidAdInsightsMetrics();
          const metricFields = this.getFilteredMetrics(
            filteredFields,
            dimensions,
            validMetricsList
          );

          allData = await provider.getAdInsights({
            advertiserId,
            dataLevel,
            dimensions,
            metrics: metricFields,
            startDate: startDate || null,
            endDate: endDate || startDate || null,
          });
          break;
        }

        case 'ad_insights_by_country': {
          const dataLevel = this.getValidatedDataLevel();
          const dimensions = this.getDimensionsForDataLevel(dataLevel);
          const countryDimensions = this.populateDimensions(dimensions, 'country_code');
          const validMetricsList = provider.getValidAdInsightsMetrics();
          const metricFields = this.getFilteredMetrics(
            filteredFields,
            countryDimensions,
            validMetricsList
          );

          allData = await provider.getAdInsights({
            advertiserId,
            dataLevel,
            dimensions: countryDimensions,
            metrics: metricFields,
            startDate: startDate || null,
            endDate: endDate || startDate || null,
          });
          break;
        }

        case 'audiences':
          allData = await provider.getAudiences(advertiserId);
          break;

        default:
          throw new Error(
            `Endpoint for ${nodeName} is not implemented yet. Feel free to add idea here: https://github.com/OWOX/owox-data-marts/discussions/categories/ideas`
          );
      }

      allData = allData.map(record => this.castFields(nodeName, record, this.fieldsSchema));

      // Mark this advertiser as having had at least one successful fetch.
      this.advertiserSuccesses.set(advertiserId, true);

      return allData;
    } catch (error) {
      // TikTok returns a list of valid fields in the error body when params are bad.
      // Retry once with that filtered list.
      if (
        error.message &&
        error.message.includes('one or more value of the param is not acceptable, correct is')
      ) {
        try {
          const fieldErrorMatch = error.message.match(/correct is \[(.*?)\]/);
          if (fieldErrorMatch && fieldErrorMatch[1]) {
            const validFieldsFromError = fieldErrorMatch[1]
              .split("', '")
              .map(f => f.replace(/'/g, '').trim());
            if (validFieldsFromError.length > 0) {
              this.context.log(
                LOG_LEVEL.INFO,
                `Retrying ${nodeName} with valid fields from API: ${validFieldsFromError.join(', ')}`
              );
              return this.fetchData({
                nodeName,
                accountId: advertiserId,
                fields: validFieldsFromError,
                startDate,
                endDate,
              });
            }
          }
        } catch (parseError) {
          this.context.log(
            LOG_LEVEL.ERROR,
            `Error parsing valid fields from error message: ${parseError.message}`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Cast record fields to the types defined in schema. Includes ad_insights
   * metric/dimension flattening and string truncation safeguards.
   */
  castFields(nodeName, record, schema) {
    const MAX_STRING_LENGTH = 50000;

    if (nodeName === 'ad_insights' || nodeName === 'ad_insights_by_country') {
      if (record.metrics) {
        for (const metricKey in record.metrics) {
          record[metricKey] = record.metrics[metricKey];
        }
        delete record.metrics;
      }

      if (record.dimensions) {
        for (const dimensionKey in record.dimensions) {
          record[dimensionKey] = record.dimensions[dimensionKey];
        }
        delete record.dimensions;
      }

      if (!record.advertiser_id && this.currentAdvertiserId) {
        record.advertiser_id = this.currentAdvertiserId;
      }

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

    if (!schema[nodeName] || !schema[nodeName].fields) {
      return record;
    }

    const processedRecord = {};

    // Add all fields defined in the schema. Every node's uniqueKeys are themselves schema
    // fields (verified across advertiser/campaigns/ad_groups/ads/ad_insights*/audiences),
    // and advertiser_id is force-set onto the record above for ad_insights/
    // ad_insights_by_country/audiences, so no separate "ensure uniqueKeys" pass is needed.
    for (let field in schema[nodeName].fields) {
      if (field in record && !processedRecord[field]) {
        processedRecord[field] = record[field];
      }
    }

    for (const field in record) {
      if (field === 'rowIndex' && !(field in processedRecord)) {
        processedRecord[field] = record[field];
      }
    }

    for (const field in processedRecord) {
      if (field in schema[nodeName].fields && 'type' in schema[nodeName].fields[field]) {
        const type = schema[nodeName].fields[field].type;
        const value = processedRecord[field];

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

            case DATA_TYPES.DATE: {
              let dateValue;
              if (value instanceof Date) {
                dateValue = value;
              } else if (typeof value === 'string') {
                let dateStr = value.replace(' ', 'T');
                if (!dateStr.includes('T')) {
                  dateStr = dateStr + 'T00:00:00Z';
                } else if (
                  !dateStr.endsWith('Z') &&
                  !dateStr.includes('+') &&
                  !dateStr.includes('-', 10)
                ) {
                  dateStr = dateStr + 'Z';
                }
                dateValue = new Date(dateStr);
              } else {
                dateValue = new Date(value);
              }
              processedRecord[field] = dateValue;
              break;
            }

            case DATA_TYPES.DATETIME: {
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
            }

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
              processedRecord[field] = String(value).substring(0, MAX_STRING_LENGTH);
              break;
          }
        } catch (error) {
          processedRecord[field] = '[Error processing value]';
        }
      } else if (field !== 'rowIndex') {
        if (processedRecord[field] !== null && processedRecord[field] !== undefined) {
          try {
            processedRecord[field] = String(processedRecord[field]).substring(0, MAX_STRING_LENGTH);
          } catch (error) {
            processedRecord[field] = '[Error processing value]';
          }
        }
      }
    }

    return processedRecord;
  }
}
