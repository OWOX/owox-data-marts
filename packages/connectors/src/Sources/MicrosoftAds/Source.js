/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
// API Documentation: https://learn.microsoft.com/en-us/advertising/reporting-service/reporting-service-reference

import { AbstractSource } from '../../Core/AbstractSource.js';

export class MicrosoftAdsSource extends AbstractSource {
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
                  key: 'OAUTH_MICROSOFT_ADS_CLIENT_ID',
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
                  key: 'OAUTH_MICROSOFT_ADS_CLIENT_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED],
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_MICROSOFT_ADS_REDIRECT_URI',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.REQUIRED],
                },
                DeveloperToken: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_MICROSOFT_ADS_DEVELOPER_TOKEN',
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
                description: 'Microsoft Ads Refresh Token',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              ClientId: {
                isRequired: true,
                requiredType: 'string',
                label: 'Client ID',
                description: 'Microsoft Ads Client ID',
              },
              ClientSecret: {
                isRequired: true,
                requiredType: 'string',
                label: 'Client Secret',
                description: 'Microsoft Ads Client Secret',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              DeveloperToken: {
                isRequired: true,
                requiredType: 'string',
                label: 'Developer Token',
                description: 'Microsoft Ads Developer Token',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
            },
          },
        ],
      },
      DeveloperToken: {
        isRequired: false,
        requiredType: 'string',
        label: 'Developer Token',
        description: 'Your Microsoft Ads API Developer Token',
        attributes: [
          CONFIG_ATTRIBUTES.SECRET,
          CONFIG_ATTRIBUTES.DEPRECATED,
          CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM,
        ],
      },
      ClientID: {
        isRequired: false,
        requiredType: 'string',
        label: 'Client ID',
        description: 'Your Microsoft Ads API Client ID',
        attributes: [CONFIG_ATTRIBUTES.DEPRECATED, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      ClientSecret: {
        isRequired: false,
        requiredType: 'string',
        label: 'Client Secret',
        description: 'Your Microsoft Ads API Client Secret',
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
        description: 'Your Microsoft Ads API Refresh Token',
        attributes: [
          CONFIG_ATTRIBUTES.SECRET,
          CONFIG_ATTRIBUTES.DEPRECATED,
          CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM,
        ],
      },
      AccessToken: {
        isRequired: false,
        requiredType: 'string',
        label: 'Access Token',
        description: 'Microsoft Ads API Access Token (auto-generated)',
        attributes: [CONFIG_ATTRIBUTES.SECRET, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      AccountIDs: {
        isRequired: true,
        requiredType: 'string',
        label: 'Account ID(s)',
        description:
          'Use the numeric Account ID from the Microsoft Ads URL aid parameter, for example 123456789. Do not use the alphanumeric account number shown elsewhere, such as A00000A0AA. For multiple accounts, separate IDs with commas.',
        placeholder: '000000000',
      },
      CustomerID: {
        isRequired: true,
        requiredType: 'string',
        label: 'Customer ID',
        description:
          'Use the numeric Customer ID from the Microsoft Ads URL cid parameter, for example 987654321. Do not use the alphanumeric customer number shown elsewhere, such as C00000C0CC.',
        placeholder: '000000000',
      },
      Fields: {
        isRequired: true,
        label: 'Fields',
        description: 'List of fields to fetch from Microsoft Ads API',
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
      ReportTimezone: {
        requiredType: 'string',
        default: 'GreenwichMeanTimeDublinEdinburghLisbonLondon',
        label: 'Report Timezone',
        description: 'Timezone for the report data',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      Aggregation: {
        requiredType: 'string',
        default: 'Daily',
        label: 'Aggregation',
        description: 'Aggregation for reports (e.g. Daily, Weekly, Monthly)',
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

    this.fieldsSchema = MicrosoftAdsFieldsSchema;
  }

  /**
   * Microsoft Ads reports take a date range, but legacy code iterated day-by-day —
   * preserve that to keep parity with existing storage state and to avoid
   * accidental large-batch failures on big accounts.
   */
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.DAY_BY_DAY;
  }

  /**
   * Parse comma-separated AccountIDs into [{ id }, ...].
   */
  getAccounts(context) {
    const accountIdsParam = context.getParameter('AccountIDs');
    if (!accountIdsParam?.value) return [null];
    return String(accountIdsParam.value)
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(id => ({ id }));
  }

  /**
   * Parse "node1 fieldA, node1 fieldB, ..." → { node1: ['fieldA','fieldB'] }.
   */
  parseFields(context) {
    const fieldsValue = context.getParameter('Fields')?.value;
    if (!fieldsValue) return {};
    return MicrosoftAdsHelper.parseFields(fieldsValue);
  }

  async exchangeOauthCredentials(credentials, variables) {
    try {
      const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

      const payload = {
        client_id: variables.ClientId,
        client_secret: variables.ClientSecret,
        grant_type: 'authorization_code',
        code: credentials.code,
        redirect_uri: variables.RedirectUri,
        scope: 'https://ads.microsoft.com/msads.manage offline_access',
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

      const resp = await fetch(tokenUrl, options);
      const data = await resp.json();

      if (data.error) {
        throw new OauthFlowException({
          message: `Token exchange failed: ${data.error_description || data.error}`,
          payload: data,
        });
      }

      const expiresIn = data.expires_in ?? 3600;

      const userData = { id: 'unknown', name: 'Microsoft Ads User' };

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
        message: 'Failed to exchange Microsoft Ads tokens',
        payload: error.message,
      });
    }
  }

  /**
   * Retrieve and store an OAuth access token using the refresh token.
   * Stores the token on the AccessToken context parameter for reuse during the run.
   *
   * Microsoft rotates the refresh token on every use, so a freshly issued
   * `refresh_token` is stored on the run's GeneratedRefreshToken parameter and
   * emitted via `this.context.updateCredentials(...)` so the host persists it
   * for the next run. The originally-configured refresh token is kept as a
   * fallback in case the host-persisted generated one is no longer valid.
   */
  async getAccessToken() {
    const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const scopes = [
      'https://ads.microsoft.com/msads.manage offline_access', // New scope
      'https://ads.microsoft.com/ads.manage offline_access', // Old scope
    ];

    const authType = this.context.getParameter('AuthType');
    const isOAuth2 = authType?.value === 'oauth2';

    const clientId =
      (isOAuth2 && authType.items?.ClientId?.value) ||
      this.context.getParameter('ClientID')?.value ||
      process.env.OAUTH_MICROSOFT_ADS_CLIENT_ID;
    const clientSecret =
      (isOAuth2 && authType.items?.ClientSecret?.value) ||
      this.context.getParameter('ClientSecret')?.value ||
      process.env.OAUTH_MICROSOFT_ADS_CLIENT_SECRET;
    const originalRefreshToken =
      (isOAuth2 && authType.items?.RefreshToken?.value) ||
      this.context.getParameter('RefreshToken')?.value;
    const generatedRefreshToken =
      this.context.getParameter(GENERATED_REFRESH_TOKEN_CONFIG_FIELD)?.value ||
      (isOAuth2 && authType.items?.[GENERATED_REFRESH_TOKEN_CONFIG_FIELD]?.value);

    // Prefer the host-persisted generated (rotated) token, falling back to the
    // originally-configured one if the generated token is rejected.
    const refreshTokens =
      generatedRefreshToken &&
      originalRefreshToken &&
      generatedRefreshToken !== originalRefreshToken
        ? [generatedRefreshToken, originalRefreshToken]
        : [generatedRefreshToken || originalRefreshToken];

    for (const scope of scopes) {
      for (const [refreshTokenIndex, refreshToken] of refreshTokens.entries()) {
        try {
          const form = {
            client_id: clientId,
            scope,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            client_secret: clientSecret,
          };

          const options = {
            method: 'post',
            contentType: 'application/x-www-form-urlencoded',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            payload: form,
            body: Object.entries(form)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
              .join('&'),
          };

          const resp = await fetch(tokenUrl, options);
          const text = await resp.text();
          const json = JSON.parse(text);

          if (json.error) {
            throw new Error(`Token error: ${json.error} - ${json.error_description}`);
          }

          const accessTokenParam = this.context.getParameter('AccessToken');
          if (accessTokenParam) {
            accessTokenParam.value = json.access_token;
          }
          // Microsoft rotates refresh tokens: reuse the new one within this run
          // and emit it so the host persists it for the next run.
          if (json.refresh_token) {
            this._setGeneratedRefreshToken(json.refresh_token);
            this.context.updateCredentials({
              [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: json.refresh_token,
            });
          }
          this.context.log(
            LOG_LEVEL.INFO,
            `Successfully obtained access token with scope (${scope})`
          );
          return;
        } catch (error) {
          const errorMessage = error.message || '';
          const isInvalidGrant =
            errorMessage.includes('invalid_grant') || errorMessage.includes('70000');
          const isInvalidScope =
            errorMessage.includes('invalid_scope') || errorMessage.includes('70011');
          const canTryNextScope = isInvalidGrant || isInvalidScope;
          const canTryOriginalRefreshToken =
            isInvalidGrant &&
            refreshTokenIndex === 0 &&
            generatedRefreshToken &&
            originalRefreshToken &&
            generatedRefreshToken !== originalRefreshToken;

          if (canTryOriginalRefreshToken) {
            this.context.log(
              LOG_LEVEL.WARN,
              'Generated Microsoft Ads refresh token failed, trying original refresh token...'
            );
            continue;
          }

          if (!canTryNextScope || scope === scopes[scopes.length - 1]) {
            // Dead refresh token = the user must reconnect the account — a warning,
            // not an ops-actionable error
            error.isWarning = isInvalidGrant;
            throw error;
          }
          this.context.log(LOG_LEVEL.WARN, `Scope ${scope} failed, trying next scope...`);
          break;
        }
      }
    }
  }

  /**
   * Stash a freshly rotated refresh token on the run's GeneratedRefreshToken
   * parameter so later token refreshes within the same run reuse it.
   */
  _setGeneratedRefreshToken(refreshToken) {
    const existing = this.context.getParameter(GENERATED_REFRESH_TOKEN_CONFIG_FIELD);
    if (existing && typeof existing === 'object') {
      existing.value = refreshToken;
      return;
    }
    this.context.sourceConfig[GENERATED_REFRESH_TOKEN_CONFIG_FIELD] = { value: refreshToken };
  }

  _getDeveloperToken() {
    const authType = this.context.getParameter('AuthType');
    if (authType?.value === 'oauth2') {
      return (
        authType.items?.DeveloperToken?.value || process.env.OAUTH_MICROSOFT_ADS_DEVELOPER_TOKEN
      );
    }
    return (
      this.context.getParameter('DeveloperToken')?.value ||
      process.env.OAUTH_MICROSOFT_ADS_DEVELOPER_TOKEN
    );
  }

  _getAccessTokenValue() {
    return this.context.getParameter('AccessToken')?.value;
  }

  _getCustomerId() {
    return this.context.getParameter('CustomerID')?.value;
  }

  /**
   * Single fetch entry point. AbstractConnector calls us with
   * { nodeName, fields, accountId, startDate, endDate }.
   *
   * For 'campaigns' (catalog node), the legacy implementation streamed batches
   * via an `onBatchReady` callback to keep memory bounded. The new architecture
   * doesn't subscribe to per-fetch DataEvents at the connector layer yet, so we
   * collect batches into a single array and return them all at once.
   * TODO: when AbstractConnector supports streaming, switch to emitting
   * DataEvent per batch via this.context.emit(new DataEvent(nodeName, batch)).
   */
  async fetchData({ nodeName, accountId, fields = [], startDate, endDate }) {
    const schema = this.fieldsSchema[nodeName];
    if (!schema) {
      throw new Error(`Unknown node: ${nodeName}`);
    }
    if (schema.uniqueKeys) {
      const missingKeys = schema.uniqueKeys.filter(key => !fields.includes(key));
      if (missingKeys.length) {
        throw new Error(`Missing unique fields for '${nodeName}': ${missingKeys.join(', ')}`);
      }
    }

    // Map AbstractConnector's startDate/endDate to legacy start_time/end_time.
    const start_time = startDate;
    const end_time = endDate;

    switch (nodeName) {
      case 'campaigns':
        return await this._fetchCampaignData({ accountId, fields });
      case 'ad_performance_report':
      case 'user_location_performance_report':
        return await this._fetchReportData({ accountId, fields, start_time, end_time, nodeName });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch campaign data (Campaigns + AssetGroups + AdGroups + Keywords) using
   * the Bulk API. Batches are accumulated and returned to the caller.
   * @private
   */
  async _fetchCampaignData({ accountId, fields }) {
    await this.getAccessToken();

    const developerToken = this._getDeveloperToken();
    const accumulated = [];

    this.context.log(
      LOG_LEVEL.INFO,
      `Fetching Campaigns, AssetGroups and AdGroups for account ${accountId}...`
    );

    const entityTypes = ['Campaigns', 'AssetGroups', 'AdGroups'];
    const allRecords = [];
    let campaignRecords = [];

    for (const entityType of entityTypes) {
      const records = await this._downloadEntity({
        submitUrl: 'https://bulk.api.bingads.microsoft.com/Bulk/v13/Campaigns/DownloadByAccountIds',
        submitOpts: {
          method: 'post',
          contentType: 'application/json',
          headers: {
            Authorization: `Bearer ${this._getAccessTokenValue()}`,
            DeveloperToken: developerToken,
            CustomerId: this._getCustomerId(),
            CustomerAccountId: accountId,
            'Content-Type': 'application/json',
          },
          payload: JSON.stringify({
            AccountIds: [Number(accountId)],
            CompressionType: 'Zip',
            DataScope: 'EntityData',
            DownloadEntities: [entityType],
            DownloadFileType: 'Csv',
            FormatVersion: '6.0',
          }),
          body: JSON.stringify({
            AccountIds: [Number(accountId)],
            CompressionType: 'Zip',
            DataScope: 'EntityData',
            DownloadEntities: [entityType],
            DownloadFileType: 'Csv',
            FormatVersion: '6.0',
          }),
        },
      });

      this.context.log(
        LOG_LEVEL.INFO,
        `${records.length} rows of ${entityType} were fetched for account ${accountId}`
      );
      allRecords.push(...records);

      if (entityType === 'Campaigns') {
        campaignRecords = records;
      }
    }

    const filteredMainData = MicrosoftAdsHelper.filterByFields(allRecords, fields);
    if (filteredMainData.length > 0) {
      accumulated.push(...filteredMainData);
    }

    this.context.log(
      LOG_LEVEL.INFO,
      `Fetching Keywords for account ${accountId} (processing by campaigns to avoid size limits)...`
    );

    const campaignIds = MicrosoftAdsHelper.extractCampaignIds(campaignRecords);
    this.context.log(
      LOG_LEVEL.INFO,
      `Found ${campaignIds.length} campaigns, fetching Keywords in batches`
    );

    let totalFetched = 0;
    await this._fetchEntityByCampaigns({
      accountId,
      entityType: 'Keywords',
      campaignIds,
      onBatchReady: async batchRecords => {
        totalFetched += batchRecords.length;
        const filteredBatch = MicrosoftAdsHelper.filterByFields(batchRecords, fields);
        accumulated.push(...filteredBatch);
      },
    });
    this.context.log(
      LOG_LEVEL.INFO,
      `${totalFetched} rows of Keywords were fetched for account ${accountId}`
    );

    return accumulated;
  }

  /**
   * Universal method to download entity data via the Bulk API.
   * @param {Object} opts
   * @param {string} opts.submitUrl - API endpoint URL
   * @param {Object} opts.submitOpts - Request options
   * @param {Function} [opts.onRecordsChunk] - When provided, records are streamed to this
   *   callback in chunks instead of being returned as one array (keeps peak memory low)
   * @returns {Array<Object>} - Empty array when onRecordsChunk is provided
   * @private
   */
  async _downloadEntity({ submitUrl, submitOpts, onRecordsChunk }) {
    const submitResp = await this.urlFetchWithRetry(submitUrl, submitOpts);
    const text = await submitResp.text();
    const responseData = JSON.parse(text);
    const requestId = responseData.DownloadRequestId;

    if (!requestId) {
      throw new Error(`Bulk download submission failed. API Response: ${text}`);
    }

    const pollUrl = 'https://bulk.api.bingads.microsoft.com/Bulk/v13/BulkDownloadStatus/Query';
    const pollOpts = Object.assign({}, submitOpts, {
      payload: JSON.stringify({ RequestId: requestId }),
      body: JSON.stringify({ RequestId: requestId }),
    });

    const pollResult = await MicrosoftAdsHelper.pollUntilStatus({
      url: pollUrl,
      options: pollOpts,
      isDone: status => {
        if (!status.RequestStatus || status.RequestStatus === 'Failed') {
          throw new Error('Bulk download failed');
        }
        return status.RequestStatus === 'Completed';
      },
    });
    if (onRecordsChunk) {
      await MicrosoftAdsHelper.processCsvRecordsFromUrl(pollResult.ResultFileUrl, onRecordsChunk);
      return [];
    }

    const csvRows = await MicrosoftAdsHelper.downloadCsvRows(pollResult.ResultFileUrl);
    return MicrosoftAdsHelper.csvRowsToObjects(csvRows);
  }

  /**
   * Fetch entity data by campaigns to avoid hitting the Bulk API 100MB limit.
   * Adaptively halves the batch size on a 100MB error and retries.
   * @private
   */
  async _fetchEntityByCampaigns({ accountId, entityType, campaignIds, onBatchReady }) {
    if (campaignIds.length === 0) {
      this.context.log(
        LOG_LEVEL.INFO,
        `No active campaigns found for account ${accountId}, skipping ${entityType} fetch`
      );
      return [];
    }

    let batchSize = Math.max(1, Math.min(50, Math.floor(campaignIds.length / 10)));

    // Stream records to storage chunk by chunk: buffering a whole batch of
    // keyword rows in memory OOMs the runner process on large accounts.
    // Storage errors are tagged so a message containing '100MB' coming from
    // onBatchReady can never trigger the download batch-halving retry below.
    const streamBatch = async batch => {
      let recordCount = 0;
      await this._downloadEntityBatch({
        accountId,
        entityType,
        campaignBatch: batch,
        onRecordsChunk: async recordsChunk => {
          recordCount += recordsChunk.length;
          try {
            await onBatchReady(recordsChunk);
          } catch (storageError) {
            storageError.isStorageError = true;
            throw storageError;
          }
        },
      });
      return recordCount;
    };
    const isTooLargeError = error =>
      !error.isStorageError && error.message && error.message.includes('100MB');

    let i = 0;
    while (i < campaignIds.length) {
      const campaignBatch = campaignIds.slice(i, i + batchSize);
      this.context.log(
        LOG_LEVEL.INFO,
        `Fetching ${entityType} for campaigns batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(campaignIds.length / batchSize)} (${campaignBatch.length} campaigns)`
      );

      try {
        const batchRecordCount = await streamBatch(campaignBatch);
        this.context.log(
          LOG_LEVEL.INFO,
          `Fetched ${batchRecordCount} ${entityType.toLowerCase()} from current batch`
        );
        i += campaignBatch.length;
      } catch (error) {
        if (isTooLargeError(error)) {
          // If still too large, reduce batch size and retry
          const retryRangeEnd = Math.min(i + batchSize, campaignIds.length);
          const newBatchSize = Math.max(1, Math.floor(batchSize / 2));
          this.context.log(
            LOG_LEVEL.WARN,
            `Batch too large (${batchSize} campaigns), retrying with smaller batch size: ${newBatchSize}`
          );

          // Retry current batch with smaller size
          for (let j = i; j < retryRangeEnd; j += newBatchSize) {
            const smallerBatch = campaignIds.slice(j, j + newBatchSize);
            try {
              const smallerBatchRecordCount = await streamBatch(smallerBatch);
              this.context.log(
                LOG_LEVEL.INFO,
                `Fetched ${smallerBatchRecordCount} ${entityType.toLowerCase()} from smaller batch (${smallerBatch.length} campaigns)`
              );
            } catch (smallerError) {
              if (isTooLargeError(smallerError)) {
                throw new Error(
                  `Failed to fetch ${entityType}: batch size of ${smallerBatch.length} campaigns still exceeds 100MB limit`
                );
              } else {
                throw new Error(`Failed to fetch ${entityType}: ${smallerError.message}`);
              }
            }
          }

          // Advance past the whole retried range so its tail is not fetched twice,
          // and keep the smaller batch size for future iterations
          i = retryRangeEnd;
          batchSize = newBatchSize;
        } else {
          this.context.log(
            LOG_LEVEL.ERROR,
            `Failed to fetch ${entityType.toLowerCase()} for campaigns ${campaignBatch.join(', ')}: ${error.message}`
          );
          throw new Error(`Failed to fetch ${entityType}: ${error.message}`);
        }
      }
    }

    return [];
  }

  /**
   * Download a single entity batch using the Bulk API.
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {string} opts.entityType
   * @param {Array<string>} opts.campaignBatch
   * @param {Function} [opts.onRecordsChunk] - Streams records in chunks when provided
   * @returns {Array<Object>} - Empty array when onRecordsChunk is provided
   * @private
   */
  async _downloadEntityBatch({ accountId, entityType, campaignBatch, onRecordsChunk }) {
    const developerToken = this._getDeveloperToken();

    const downloadBody = {
      Campaigns: campaignBatch.map(id => ({
        CampaignId: Number(id),
        ParentAccountId: Number(accountId),
      })),
      CompressionType: 'Zip',
      DataScope: 'EntityData',
      DownloadEntities: [entityType],
      DownloadFileType: 'Csv',
      FormatVersion: '6.0',
    };

    const submitOpts = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${this._getAccessTokenValue()}`,
        DeveloperToken: developerToken,
        CustomerId: this._getCustomerId(),
        CustomerAccountId: accountId,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(downloadBody),
      body: JSON.stringify(downloadBody),
    };

    return await this._downloadEntity({
      submitUrl: 'https://bulk.api.bingads.microsoft.com/Bulk/v13/Campaigns/DownloadByCampaignIds',
      submitOpts,
      onRecordsChunk,
    });
  }

  /**
   * Fetch report data using the Reporting API.
   * @private
   */
  async _fetchReportData({ accountId, fields, start_time, end_time, nodeName }) {
    await this.getAccessToken();
    const schema = this.fieldsSchema[nodeName];

    const submitResponse = await this._submitReportRequest({
      accountId,
      fields,
      start_time,
      end_time,
      schema,
    });

    const pollResult = await this._pollReportStatus({ submitResponse, accountId });

    if (!pollResult.ReportRequestStatus.ReportDownloadUrl) {
      this.context.log(
        LOG_LEVEL.INFO,
        `No data available for the specified time period (${start_time} to ${end_time}). Report status: ${JSON.stringify(pollResult.ReportRequestStatus)}`
      );
      return [];
    }

    const csvRows = await MicrosoftAdsHelper.downloadCsvRows(
      pollResult.ReportRequestStatus.ReportDownloadUrl
    );
    const records = MicrosoftAdsHelper.csvRowsToObjects(csvRows);
    return MicrosoftAdsHelper.filterByFields(records, fields);
  }

  /**
   * Submit a report request to the Microsoft Ads Reporting API.
   * @private
   */
  async _submitReportRequest({ accountId, fields, start_time, end_time, schema }) {
    const dateRange = {
      CustomDateRangeStart: {
        Day: new Date(start_time).getDate(),
        Month: new Date(start_time).getMonth() + 1,
        Year: new Date(start_time).getFullYear(),
      },
      CustomDateRangeEnd: {
        Day: new Date(end_time).getDate(),
        Month: new Date(end_time).getMonth() + 1,
        Year: new Date(end_time).getFullYear(),
      },
      ReportTimeZone: this.context.getParameter('ReportTimezone')?.value,
    };
    const submitUrl =
      'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Submit';
    const requestBody = {
      ExcludeColumnHeaders: false,
      ExcludeReportFooter: true,
      ExcludeReportHeader: true,
      ReportName: schema.overview,
      ReturnOnlyCompleteData: false,
      Type: schema.reportType,
      Aggregation: this.context.getParameter('Aggregation')?.value,
      Columns: fields,
      Scope: { AccountIds: [Number(accountId)] },
      Time: dateRange,
    };
    const developerToken = this._getDeveloperToken();
    const customerId = this._getCustomerId();

    const submitOpts = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${this._getAccessTokenValue()}`,
        CustomerAccountId: `${customerId}|${accountId}`,
        CustomerId: customerId,
        DeveloperToken: developerToken,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ ReportRequest: requestBody }),
      body: JSON.stringify({ ReportRequest: requestBody }),
    };
    const submitResp = await this.urlFetchWithRetry(submitUrl, submitOpts);
    const submitResponseText = await submitResp.text();

    try {
      const submitResponse = JSON.parse(submitResponseText);
      if (submitResponse.OperationErrors && submitResponse.OperationErrors.length > 0) {
        const error = submitResponse.OperationErrors[0];
        throw new Error(
          `Microsoft Ads API Error ${error.Code}: ${error.ErrorCode} - ${error.Message}`
        );
      }
      return submitResponse;
    } catch (parseError) {
      if (parseError.message.includes('Microsoft Ads API Error')) {
        throw parseError;
      }
      throw new Error(`Failed to parse submit response: ${parseError.message}`);
    }
  }

  /**
   * Poll for report completion status.
   * @private
   */
  async _pollReportStatus({ submitResponse, accountId }) {
    const pollUrl = 'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Poll';
    const submitResponseText = JSON.stringify(submitResponse);
    const developerToken = this._getDeveloperToken();
    const customerId = this._getCustomerId();

    const pollOpts = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${this._getAccessTokenValue()}`,
        CustomerAccountId: submitResponse.CustomerAccountId || `${customerId}|${accountId}`,
        CustomerId: customerId,
        DeveloperToken: developerToken,
        'Content-Type': 'application/json',
      },
      payload: submitResponseText,
      body: submitResponseText,
    };

    return await MicrosoftAdsHelper.pollUntilStatus({
      url: pollUrl,
      options: pollOpts,
      isDone: status => {
        if (!status.ReportRequestStatus || status.ReportRequestStatus.Status === 'Error') {
          throw new Error('Report generation failed');
        }
        return status.ReportRequestStatus.Status === 'Success';
      },
    });
  }
}
