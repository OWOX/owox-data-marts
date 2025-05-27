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
    const tokenOptions = {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      payload: {
        client_id: this.config.ClientID.value,
        scope: 'https://ads.microsoft.com/ads.manage',
        refresh_token: this.config.RefreshToken.value,
        grant_type: 'refresh_token',
        client_secret: this.config.ClientSecret.value
      }
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
      payload: JSON.stringify({
        AccountIds: [Number(accountId)],
        CompressionType: 'Zip',
        DataScope: 'EntityData',
        DownloadEntities: ['Keywords','AdGroups','Campaigns','AssetGroups'],
        DownloadFileType: 'Csv',
        FormatVersion: '6.0'
      })
    };
    const submitResp = EnvironmentAdapter.fetch(submitUrl, submitOpts);
    const requestId = JSON.parse(submitResp.getContentText()).DownloadRequestId;

    const pollUrl = 'https://bulk.api.bingads.microsoft.com/Bulk/v13/BulkDownloadStatus/Query';
    const pollOpts = Object.assign({}, submitOpts, { payload: JSON.stringify({ RequestId: requestId }) });
    const pollResult = this._pollUntilStatus({ url: pollUrl, options: pollOpts, isDone: status => status.RequestStatus === 'Completed' });

    const csvRows = this._downloadCsvRows(pollResult.ResultFileUrl);
    const records = this._csvRowsToObjects(csvRows);
    return this._filterByFields(records, fields);
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
        DeveloperToken: this.config.DeveloperToken.value
      },
      payload: JSON.stringify({ ReportRequest: requestBody })
    };
    const submitResp = EnvironmentAdapter.fetch(submitUrl, submitOpts);

    const pollUrl = 'https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Poll';
    const pollOpts = Object.assign({}, submitOpts, { payload: submitResp.getContentText() });
    const pollResult = this._pollUntilStatus({ url: pollUrl, options: pollOpts, isDone: status => status.ReportRequestStatus.Status === 'Success' });

    const csvRows = this._downloadCsvRows(pollResult.ReportRequestStatus.ReportDownloadUrl);
    const records = this._csvRowsToObjects(csvRows);
    return this._filterByFields(records, fields);
  }

  /**
   * Poll the given URL until the provided isDone callback returns true, or until 30 minutes have elapsed
   * @param {Object} opts
   * @param {string} opts.url
   * @param {Object} opts.options
   * @param {function(Object): boolean} opts.isDone
   * @param {number} [opts.interval=5000]
   * @returns {Object}
   * @private
   */
  _pollUntilStatus({ url, options, isDone, interval = 5000 }) {
    const startTime = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes in ms
    let statusResult;
    do {
      if (Date.now() - startTime > timeout) {
        throw new Error('Polling timed out after 30 minutes');
      }
      EnvironmentAdapter.sleep(interval);
      const response = EnvironmentAdapter.fetch(url, options);
      statusResult = JSON.parse(response.getContentText());
    } while (!isDone(statusResult));
    return statusResult;
  }

  /**
   * Download, unzip and parse CSV rows from the given URL
   * @param {string} url
   * @returns {Array<Array<string>>}
   * @private
   */
  _downloadCsvRows(url) {
    const response = EnvironmentAdapter.fetch(url);
    const files = EnvironmentAdapter.unzip(response.getBlob());
    const allRows = [];
    files.forEach(file => {
      const csvText = file.getDataAsString();
      const rows = EnvironmentAdapter.parseCsv(csvText);
      allRows.push(...rows);
    });
    return allRows;
  }

  /**
   * Convert a 2D array of CSV rows into an array of objects
   * @param {Array<Array<string>>} csvRows
   * @returns {Array<Object>}
   * @private
   */
  _csvRowsToObjects(csvRows) {
    const filteredRows = csvRows.filter((row, idx) => idx === 0 || row[0] !== 'Format Version');
    const headerNames = filteredRows[0].map(rawHeader => rawHeader.replace(/[^a-zA-Z0-9]/g, ''));
    return filteredRows.slice(1).map(rowValues => {
      const record = {};
      headerNames.forEach((headerName, colIndex) => {
        record[headerName] = rowValues[colIndex];
      });
      return record;
    });
  }

  /**
   * Filter data to include only specified fields
   * @param {Array<Object>} data
   * @param {Array<string>} fields
   * @returns {Array<Object>}
   * @private
   */
  _filterByFields(data, fields) {
    if (!fields.length) return data;
    return data.map(record => {
      const filteredRecord = {};
      fields.forEach(fieldName => {
        if (fieldName in record) {
          filteredRecord[fieldName] = record[fieldName];
        }
      });
      return filteredRecord;
    });
  }
};
