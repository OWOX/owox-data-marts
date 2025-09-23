/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
// API Documentation: https://learn.microsoft.com/en-us/advertising/reporting-service/reporting-service-reference

var MicrosoftAdsSource = class MicrosoftAdsSource extends AbstractSource {
  constructor(config) {
    super(config.mergeParameters({
      DeveloperToken: {
        isRequired: true,
        requiredType: "string",
        label: "Developer Token",
        description: "Your Microsoft Ads API Developer Token"
      },
      ClientID: {
        isRequired: true,
        requiredType: "string",
        label: "Client ID",
        description: "Your Microsoft Ads API Client ID"
      },
      ClientSecret: {
        isRequired: true,
        requiredType: "string",
        label: "Client Secret",
        description: "Your Microsoft Ads API Client Secret"
      },
      RefreshToken: {
        isRequired: true,
        requiredType: "string",
        label: "Refresh Token",
        description: "Your Microsoft Ads API Refresh Token"
      },
      AccountID: {
        isRequired: true,
        requiredType: "string",
        label: "Account ID",
        description: "Your Microsoft Ads Account ID"
      },
      CustomerID: {
        isRequired: true,
        requiredType: "string",
        label: "Customer ID",
        description: "Your Microsoft Ads Customer ID"
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
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        label: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 30,
        label: "Max Fetching Days",
        description: "Maximum number of days to fetch data for"
      },
      ReportTimezone: {
        requiredType: "string",
        default: "GreenwichMeanTimeDublinEdinburghLisbonLondon",
        label: "Report Timezone",
        description: "Timezone for the report data"
      },
      Aggregation: {
        requiredType: "string",
        default: "Daily",
        label: "Aggregation",
        description: "Aggregation for reports (e.g. Daily, Weekly, Monthly)"
      },
      CreateEmptyTables: {
        requiredType: "string",  // TODO: Change to boolean type
        default: "true",
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API"
      }
    }));
    this.fieldsSchema = MicrosoftAdsFieldsSchema;
  }

  /**
   * Returns credential fields for this source
   * @returns {Object}
   */
  getCredentialFields() {
    return {
      DeveloperToken: this.config.DeveloperToken,
      ClientID: this.config.ClientID,
      ClientSecret: this.config.ClientSecret,
      RefreshToken: this.config.RefreshToken
    };
  }

  /**
   * Retrieve and store an OAuth access token using the refresh token
   */
  getAccessToken() {
    const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const scopes = [
      'https://ads.microsoft.com/msads.manage', // New scope
      'https://ads.microsoft.com/ads.manage'    // Old scope
    ];
    
    for (const scope of scopes) {
      try {
        const form = {
          client_id: this.config.ClientID.value,
          scope: scope,
          refresh_token: this.config.RefreshToken.value,
          grant_type: 'refresh_token',
          client_secret: this.config.ClientSecret.value
        };
        
        const options = {
          method: 'post',
          contentType: 'application/x-www-form-urlencoded',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          payload: form,
          body: Object.entries(form)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&') // TODO: body is for Node.js; refactor to centralize JSON option creation
        };
        
        const resp = EnvironmentAdapter.fetch(tokenUrl, options);
        const json = JSON.parse(resp.getContentText());
        
        if (json.error) {
          throw new Error(`Token error: ${json.error} - ${json.error_description}`);
        }
        
        this.config.AccessToken = { value: json.access_token };
        this.config.logMessage(`Successfully obtained access token with scope (${scope})`);
        return;
      } catch (error) {
        // If it's not an invalid_grant error or we're on the last scope, throw the error
        if (!error.message?.includes('invalid_grant') && !error.message?.includes('70000') || scope === scopes[scopes.length - 1]) {
          throw error;
        }
        this.config.logMessage(`Scope ${scope} failed, trying next scope...`);
      }
    }
  }

  /**
   * Single entry point for all fetches
   * @param {Object} opts
   * @param {string} opts.nodeName
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @param {string} [opts.start_time]
   * @param {string} [opts.end_time]
   * @param {Function} [opts.onBatchReady] - Optional callback for batch processing
   * @returns {Array<Object>}
   */
  fetchData({ nodeName, accountId, fields = [], start_time, end_time, onBatchReady }) {
    const schema = this.fieldsSchema[nodeName];
    if (schema.uniqueKeys) {
      const missingKeys = schema.uniqueKeys.filter(key => !fields.includes(key));
      if (missingKeys.length) {
        throw new Error(`Missing unique fields for '${nodeName}': ${missingKeys.join(', ')}`);
      }
    }
    switch (nodeName) {
      case 'campaigns':
        this._fetchCampaignData({ accountId, fields, onBatchReady });
        return [];
      case 'ad_performance_report':
        return this._fetchReportData({ accountId, fields, start_time, end_time, nodeName });
      case 'user_location_performance_report':
        return this._fetchReportData({ accountId, fields, start_time, end_time, nodeName });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch campaign data using the Bulk API
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @param {Function} opts.onBatchReady - Callback function to handle each batch of data
   * @returns {void}
   * @private
   */
  _fetchCampaignData({ accountId, fields, onBatchReady }) {
    this.getAccessToken();
    
    this.config.logMessage(`Fetching Campaigns, AssetGroups and AdGroups for account ${accountId}...`);
    
    const entityTypes = ['Campaigns', 'AssetGroups', 'AdGroups'];
    const allRecords = [];
    let campaignRecords = [];
    
    for (const entityType of entityTypes) {
      const records = this._downloadEntity({
        submitUrl: 'https://bulk.api.bingads.microsoft.com/Bulk/v13/Campaigns/DownloadByAccountIds',
        submitOpts: {
          method: 'post',
          contentType: 'application/json',
          headers: {
            Authorization: `Bearer ${this.config.AccessToken.value}`,
            DeveloperToken: this.config.DeveloperToken.value,
            CustomerId: this.config.CustomerID.value,
            CustomerAccountId: accountId,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify({
            AccountIds: [Number(accountId)],
            CompressionType: 'Zip',
            DataScope: 'EntityData',
            DownloadEntities: [entityType],
            DownloadFileType: 'Csv',
            FormatVersion: '6.0'
          }),
          body: JSON.stringify({
            AccountIds: [Number(accountId)],
            CompressionType: 'Zip',
            DataScope: 'EntityData',
            DownloadEntities: [entityType],
            DownloadFileType: 'Csv',
            FormatVersion: '6.0'
          })
        }
      });
      
      this.config.logMessage(`${records.length} rows of ${entityType} were fetched for account ${accountId}`);
      allRecords.push(...records);
      
      // Keep campaigns for later use
      if (entityType === 'Campaigns') {
        campaignRecords = records;
      }
    }
    
    // Save main data immediately
    const filteredMainData = MicrosoftAdsHelper.filterByFields(allRecords, fields);
    if (filteredMainData.length > 0) {
      onBatchReady(filteredMainData);
    }
    
    // Handle Keywords with batching to avoid 100MB limit
    this.config.logMessage(`Fetching Keywords for account ${accountId} (processing by campaigns to avoid size limits)...`);
    
    // Extract campaign IDs from campaigns
    const campaignIds = MicrosoftAdsHelper.extractCampaignIds(campaignRecords);
    this.config.logMessage(`Found ${campaignIds.length} campaigns, fetching Keywords in batches`);
    this.config.logMessage(`Campaign IDs: ${campaignIds.slice(0, 10).join(', ')}${campaignIds.length > 10 ? '...' : ''}`);
    
    let totalFetched = 0;
    this._fetchEntityByCampaigns({ 
      accountId, 
      entityType: 'Keywords', 
      campaignIds,
      onBatchReady: (batchRecords) => {
        totalFetched += batchRecords.length;
        const filteredBatch = MicrosoftAdsHelper.filterByFields(batchRecords, fields);
        onBatchReady(filteredBatch);
      }
    });
    this.config.logMessage(`${totalFetched} rows of Keywords were fetched for account ${accountId}`);
  }

  /**
   * Universal method to download entity data
   * @param {Object} opts
   * @param {string} opts.submitUrl - API endpoint URL
   * @param {Object} opts.downloadBody - Request body
   * @param {Object} opts.submitOpts - Request options
   * @returns {Array<Object>}
   * @private
   */
  _downloadEntity({ submitUrl, submitOpts }) {    
    const submitResp = EnvironmentAdapter.fetch(submitUrl, submitOpts);
    const requestId = JSON.parse(submitResp.getContentText()).DownloadRequestId;

    const pollUrl = 'https://bulk.api.bingads.microsoft.com/Bulk/v13/BulkDownloadStatus/Query';
    const pollOpts = Object.assign({}, submitOpts, { 
      payload: JSON.stringify({ RequestId: requestId }), 
      body: JSON.stringify({ RequestId: requestId }) 
    });
    
    const pollResult = MicrosoftAdsHelper.pollUntilStatus({ 
      url: pollUrl, 
      options: pollOpts, 
      isDone: status => status.RequestStatus === 'Completed' 
    });
    const csvRows = MicrosoftAdsHelper.downloadCsvRows(pollResult.ResultFileUrl);
    const result = MicrosoftAdsHelper.csvRowsToObjects(csvRows);
        
    return result;
  }

  /**
   * Fetch entity data by campaigns to avoid large ZIP files
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {string} opts.entityType - Type of entity to fetch (AdGroups, AssetGroups, Keywords)
   * @param {Array<string>} opts.campaignIds - Array of campaign IDs
   * @param {Function} opts.onBatchReady - Optional callback function to handle each batch of data
   * @returns {Array<Object>} - Returns empty array if onBatchReady callback is provided, otherwise returns all records
   * @private
   */
  _fetchEntityByCampaigns({ accountId, entityType, campaignIds, onBatchReady }) {
    if (campaignIds.length === 0) {
      this.config.logMessage(`No active campaigns found for account ${accountId}, skipping ${entityType} fetch`);
      return [];
    }

    // Start with batch size of 100 campaigns per batch
    let batchSize = Math.max(1, Math.min(50, Math.floor(campaignIds.length / 10)));
    
    for (let i = 0; i < campaignIds.length; i += batchSize) {
      const campaignBatch = campaignIds.slice(i, i + batchSize);
      this.config.logMessage(`Fetching ${entityType} for campaigns batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(campaignIds.length/batchSize)} (${campaignBatch.length} campaigns)`);
      
      try {
        const batchRecords = this._downloadEntityBatch({ accountId, entityType, campaignBatch });
        this.config.logMessage(`Fetched ${batchRecords.length} ${entityType.toLowerCase()} from current batch`);
        
        onBatchReady(batchRecords);
      } catch (error) {
        if (error.message && error.message.includes('100MB')) {
          // If still too large, reduce batch size and retry
          const newBatchSize = Math.max(1, Math.floor(batchSize / 2));
          this.config.logMessage(`Batch too large (${batchSize} campaigns), retrying with smaller batch size: ${newBatchSize}`);
          
          // Retry current batch with smaller size
          for (let j = i; j < Math.min(i + batchSize, campaignIds.length); j += newBatchSize) {
            const smallerBatch = campaignIds.slice(j, j + newBatchSize);
            try {
              const smallerBatchRecords = this._downloadEntityBatch({ accountId, entityType, campaignBatch: smallerBatch });
              this.config.logMessage(`Fetched ${smallerBatchRecords.length} ${entityType.toLowerCase()} from smaller batch (${smallerBatch.length} campaigns)`);
              onBatchReady(smallerBatchRecords);
            } catch (smallerError) {
              if (smallerError.message && smallerError.message.includes('100MB')) {
                throw new Error(`Failed to fetch ${entityType}: batch size of ${smallerBatch.length} campaigns still exceeds 100MB limit`);
              } else {
                throw new Error(`Failed to fetch ${entityType}: ${smallerError.message}`);
              }
            }
          }
          
          // Update batch size for future iterations
          batchSize = newBatchSize;
        } else {
          this.config.logMessage(`⚠️ Failed to fetch ${entityType.toLowerCase()} for campaigns ${campaignBatch.join(', ')}: ${error.message}`);
          throw new Error(`Failed to fetch ${entityType}: ${error.message}`);
        }
      }
    }
    
    return [];
  }

  /**
   * Download entity batch using bulk API
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {string} opts.entityType
   * @param {Array<string>} opts.campaignBatch
   * @returns {Array<Object>}
   * @private
   */
  _downloadEntityBatch({ accountId, entityType, campaignBatch }) {
    const downloadBody = {
      Campaigns: campaignBatch.map(id => ({ 
        CampaignId: Number(id), 
        ParentAccountId: Number(accountId) 
      })),
      CompressionType: 'Zip',
      DataScope: 'EntityData',
      DownloadEntities: [entityType],
      DownloadFileType: 'Csv',
      FormatVersion: '6.0'
    };

    const submitOpts = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${this.config.AccessToken.value}`,
        DeveloperToken: this.config.DeveloperToken.value,
        CustomerId: this.config.CustomerID.value,
        CustomerAccountId: accountId,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(downloadBody),
      body: JSON.stringify(downloadBody)
    };
    
    return this._downloadEntity({
      submitUrl: 'https://bulk.api.bingads.microsoft.com/Bulk/v13/Campaigns/DownloadByCampaignIds',
      submitOpts
    });
  }

  /**
   * Fetch report data using the Reporting API
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @param {string} opts.start_time
   * @param {string} opts.end_time
   * @param {string} opts.nodeName
   * @returns {Array<Object>}
   * @private
   */
  _fetchReportData({ accountId, fields, start_time, end_time, nodeName }) {
    this.getAccessToken();
    const schema = this.fieldsSchema[nodeName];
    
    const submitResponse = this._submitReportRequest({ 
      accountId, 
      fields, 
      start_time, 
      end_time, 
      schema 
    });
    
    const pollResult = this._pollReportStatus({ submitResponse });
    
    if (!pollResult.ReportRequestStatus.ReportDownloadUrl) {
      this.config.logMessage(`No data available for the specified time period (${start_time} to ${end_time}). Report status: ${JSON.stringify(pollResult.ReportRequestStatus)}`);
      return [];
    }
    
    const csvRows = MicrosoftAdsHelper.downloadCsvRows(pollResult.ReportRequestStatus.ReportDownloadUrl);
    const records = MicrosoftAdsHelper.csvRowsToObjects(csvRows);
    return MicrosoftAdsHelper.filterByFields(records, fields);
  }

  /**
   * Submit a report request to Microsoft Ads API
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @param {string} opts.start_time
   * @param {string} opts.end_time
   * @param {Object} opts.schema
   * @returns {Object} - Submit response
   * @private
   */
  _submitReportRequest({ accountId, fields, start_time, end_time, schema }) {
    const dateRange = {
      CustomDateRangeStart: { Day: new Date(start_time).getDate(), Month: new Date(start_time).getMonth() + 1, Year: new Date(start_time).getFullYear() },
      CustomDateRangeEnd: { Day: new Date(end_time).getDate(), Month: new Date(end_time).getMonth() + 1, Year: new Date(end_time).getFullYear() },
      ReportTimeZone: this.config.ReportTimezone.value
    };
    const submitUrl = 'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Submit';
    const requestBody = {
      ExcludeColumnHeaders: false,
      ExcludeReportFooter: true,
      ExcludeReportHeader: true,
      ReportName: schema.overview,
      ReturnOnlyCompleteData: false,
      Type: schema.reportType,
      Aggregation: this.config.Aggregation.value,
      Columns: fields,
      Scope: { AccountIds: [Number(accountId)] },
      Time: dateRange
    };
    const submitOpts = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${this.config.AccessToken.value}`,
        CustomerAccountId: `${this.config.CustomerID.value}|${accountId}`,
        CustomerId: this.config.CustomerID.value,
        DeveloperToken: this.config.DeveloperToken.value,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ ReportRequest: requestBody }),
      body: JSON.stringify({ ReportRequest: requestBody }) // TODO: body is for Node.js; refactor to centralize JSON option creation
    };
    const submitResp = EnvironmentAdapter.fetch(submitUrl, submitOpts);
    const submitResponseText = submitResp.getContentText();
    
    try {
      const submitResponse = JSON.parse(submitResponseText);
      if (submitResponse.OperationErrors && submitResponse.OperationErrors.length > 0) {
        const error = submitResponse.OperationErrors[0];
        throw new Error(`Microsoft Ads API Error ${error.Code}: ${error.ErrorCode} - ${error.Message}`);
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
   * Poll for report completion status
   * @param {Object} opts
   * @param {Object} opts.submitResponse - Response from submit request
   * @param {string} opts.start_time
   * @param {string} opts.end_time
   * @returns {Object} - Poll result with report status
   * @private
   */
  _pollReportStatus({ submitResponse }) {
    const pollUrl = 'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Poll';
    const submitResponseText = JSON.stringify(submitResponse);
    const pollOpts = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${this.config.AccessToken.value}`,
        CustomerAccountId: submitResponse.CustomerAccountId || `${this.config.CustomerID.value}|${this.config.AccountID.value}`,
        CustomerId: this.config.CustomerID.value,
        DeveloperToken: this.config.DeveloperToken.value,
        'Content-Type': 'application/json'
      },
      payload: submitResponseText,
      body: submitResponseText
    };
    
    return MicrosoftAdsHelper.pollUntilStatus({ 
      url: pollUrl, 
      options: pollOpts, 
      isDone: status => status.ReportRequestStatus.Status === 'Success' 
    });
  }
};
