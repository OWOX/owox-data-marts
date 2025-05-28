/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
// API Documentation: https://learn.microsoft.com/en-us/advertising/reporting-service/reporting-service-reference

var BingAdsConnector = class BingAdsConnector extends AbstractConnector {
  constructor(config) {
    super(config.mergeParameters({
      DeveloperToken: {
        isRequired: true,
        requiredType: "string",
        displayName: "Developer Token",
        description: "Your Bing Ads API Developer Token"
      },
      ClientID: {
        isRequired: true,
        requiredType: "string",
        displayName: "Client ID",
        description: "Your Bing Ads API Client ID"
      },
      ClientSecret: {
        isRequired: true,
        requiredType: "string",
        displayName: "Client Secret",
        description: "Your Bing Ads API Client Secret"
      },
      RefreshToken: {
        isRequired: true,
        requiredType: "string",
        displayName: "Refresh Token",
        description: "Your Bing Ads API Refresh Token"
      },
      AccountID: {
        isRequired: true,
        requiredType: "string",
        displayName: "Account ID",
        description: "Your Bing Ads Account ID"
      },
      CustomerID: {
        isRequired: true,
        requiredType: "string",
        displayName: "Customer ID",
        description: "Your Bing Ads Customer ID"
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        displayName: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 30,
        displayName: "Max Fetching Days",
        description: "Maximum number of days to fetch data for"
      },
      ReportTimezone: {
        requiredType: "string",
        default: "GreenwichMeanTimeDublinEdinburghLisbonLondon",
        displayName: "Report Timezone",
        description: "Timezone for the report data"
      },
      Aggregation: {
        requiredType: "string",
        default: "Daily",
        displayName: "Aggregation",
        description: "Aggregation for reports (e.g. Daily, Weekly, Monthly)"
      }
    }));
    this.fieldsSchema = BingAdsFieldsSchema;
  }

  /**
   * Returns credential fields for this connector
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
    const form = {
      client_id: this.config.ClientID.value,
      scope: 'https://ads.microsoft.com/ads.manage',
      refresh_token: this.config.RefreshToken.value,
      grant_type: 'refresh_token',
      client_secret: this.config.ClientSecret.value
    };
    const tokenOptions = {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      payload: form,
      body: Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&') // TODO: body is for Node.js; refactor to centralize JSON option creation
    };
    const resp = EnvironmentAdapter.fetch(tokenUrl, tokenOptions);
    const json = JSON.parse(resp.getContentText());
    this.config.AccessToken = { value: json.access_token };
  }

  /**
   * Single entry point for all fetches
   * @param {Object} opts
   * @param {string} opts.nodeName
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @param {string} [opts.start_time]
   * @param {string} [opts.end_time]
   * @returns {Array<Object>}
   */
  fetchData({ nodeName, accountId, fields = [], start_time, end_time }) {
    const schema = this.fieldsSchema[nodeName];
    if (schema.uniqueKeys) {
      const missingKeys = schema.uniqueKeys.filter(key => !fields.includes(key));
      if (missingKeys.length) {
        throw new Error(`Missing unique fields for '${nodeName}': ${missingKeys.join(', ')}`);
      }
    }
    switch (nodeName) {
      case 'campaigns':
        return this._fetchCampaignData({ accountId, fields });
      case 'ad_performance_report':
        return this._fetchAdPerformanceData({ accountId, fields, start_time, end_time });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Fetch campaign data using the Bulk API
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @returns {Array<Object>}
   * @private
   */
  _fetchCampaignData({ accountId, fields }) {
    this.getAccessToken();
    const submitUrl = 'https://bulk.api.bingads.microsoft.com/Bulk/v13/Campaigns/DownloadByAccountIds';
    const downloadBody = {
      AccountIds: [Number(accountId)],
      CompressionType: 'Zip',
      DataScope: 'EntityData',
      DownloadEntities: ['Keywords','AdGroups','Campaigns','AssetGroups'],
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
      body: JSON.stringify(downloadBody) // TODO: body is for Node.js; refactor to centralize JSON option creation
    };
    const submitResp = EnvironmentAdapter.fetch(submitUrl, submitOpts);
    const requestId = JSON.parse(submitResp.getContentText()).DownloadRequestId;

    const pollUrl = 'https://bulk.api.bingads.microsoft.com/Bulk/v13/BulkDownloadStatus/Query';
    const pollOpts = Object.assign({}, submitOpts, { payload: JSON.stringify({ RequestId: requestId }), body: JSON.stringify({ RequestId: requestId }) });
    const pollResult = BingAdsHelper.pollUntilStatus({ url: pollUrl, options: pollOpts, isDone: status => status.RequestStatus === 'Completed' });

    const csvRows = BingAdsHelper.downloadCsvRows(pollResult.ResultFileUrl);
    const records = BingAdsHelper.csvRowsToObjects(csvRows);
    return BingAdsHelper.filterByFields(records, fields);
  }

  /**
   * Fetch ad performance report data using the Reporting API
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {Array<string>} opts.fields
   * @param {string} opts.start_time
   * @param {string} opts.end_time
   * @returns {Array<Object>}
   * @private
   */
  _fetchAdPerformanceData({ accountId, fields, start_time, end_time }) {
    this.getAccessToken();
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
      ReportName: 'Ad Performance Report',
      ReturnOnlyCompleteData: false,
      Type: 'AdPerformanceReportRequest',
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

    const pollUrl = 'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Poll';
    const pollOpts = Object.assign({}, submitOpts, { payload: submitResp.getContentText(), body: submitResp.getContentText() });
    const pollResult = BingAdsHelper.pollUntilStatus({ url: pollUrl, options: pollOpts, isDone: status => status.ReportRequestStatus.Status === 'Success' });

    const csvRows = BingAdsHelper.downloadCsvRows(pollResult.ReportRequestStatus.ReportDownloadUrl);
    const records = BingAdsHelper.csvRowsToObjects(csvRows);
    return BingAdsHelper.filterByFields(records, fields);
  }
};
