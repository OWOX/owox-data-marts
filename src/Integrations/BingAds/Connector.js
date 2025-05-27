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
   * Get access token using refresh token
   */
  getAccessToken() {
    const url = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const options = {
      "method": 'post',
      "contentType": "application/x-www-form-urlencoded",
      "headers": {"Content-Type": "application/x-www-form-urlencoded"},
      "payload": {
        "client_id": this.config.ClientID.value,
        "scope": "https://ads.microsoft.com/ads.manage",
        "refresh_token": this.config.RefreshToken.value,
        "grant_type": "refresh_token",
        "client_secret": this.config.ClientSecret.value
      }
    };
    
    const response = EnvironmentAdapter.fetch(url, options);
    const responseObject = JSON.parse(response.getContentText());
    this.config.AccessToken = {
      value: responseObject.access_token
    };
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
    if (this.fieldsSchema[nodeName].uniqueKeys) {
      const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys;
      const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
      
      if (missingKeys.length > 0) {
        throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
      }
    }

    switch (nodeName) {
      case 'ad_performance_report':
        return this._fetchAdPerformanceReport({ accountId, fields, start_time, end_time });
      case 'campaigns':
        return this._fetchCampaigns({ accountId, fields });
      default:
        throw new Error(`Unknown node: ${nodeName}`);
    }
  }

  /**
   * Filter data to include only specified fields
   * @param {Array<Object>} data - Array of data objects
   * @param {Array<string>} fields - Array of field names to include
   * @returns {Array<Object>} Filtered data
   * @private
   */
  _filterByFields(data, fields) {
    if (!fields || !fields.length) {
      return data;
    }

    return data.map(row => {
      const filteredRow = {};
      fields.forEach(field => {
        if (field in row) {
          filteredRow[field] = row[field];
        }
      });
      return filteredRow;
    });
  }

  /**
   * Fetch campaign data using the Bulk API
   * @param {Object} options
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Fields to fetch
   * @returns {Array<Object>} Array of campaign data
   */
  _fetchCampaigns({ accountId, fields }) {
    // Update access token
    this.getAccessToken();

    // Step 1: Submit download request
    const submitUrl = "https://bulk.api.bingads.microsoft.com/Bulk/v13/Campaigns/DownloadByAccountIds";
    const submitOptions = {
      "method": "post",
      "contentType": "application/json",
      "headers": {
        "Authorization": "Bearer " + this.config.AccessToken.value,
        "DeveloperToken": this.config.DeveloperToken.value,
        "CustomerId": this.config.CustomerID.value,
        "CustomerAccountId": accountId,
        "Content-Type": "application/json"
      },
      "payload": JSON.stringify({
        "AccountIds": [Number(accountId)],
        "CompressionType": "Zip",
        "DataScope": "EntityData",
        "DownloadEntities": ["Keywords", "AdGroups", "Campaigns", "AssetGroups"],
        "DownloadFileType": "Csv",
        "FormatVersion": "6.0"
      })
    };

    const submitResponse = EnvironmentAdapter.fetch(submitUrl, submitOptions);
    const submitResult = JSON.parse(submitResponse.getContentText());
    const requestId = submitResult.DownloadRequestId;

    // Step 2: Poll for completion
    const pollUrl = "https://bulk.api.bingads.microsoft.com/Bulk/v13/BulkDownloadStatus/Query";
    const pollOptions = {
      "method": "post",
      "contentType": "application/json",
      "headers": {
        "Authorization": "Bearer " + this.config.AccessToken.value,
        "DeveloperToken": this.config.DeveloperToken.value,
        "CustomerId": this.config.CustomerID.value,
        "CustomerAccountId": accountId,
        "Content-Type": "application/json"
      },
      "payload": JSON.stringify({
        "RequestId": requestId
      })
    };

    let pollResult;
    do {
      EnvironmentAdapter.sleep(5000); // Wait 5 seconds between polls
      const pollResponse = EnvironmentAdapter.fetch(pollUrl, pollOptions);
      pollResult = JSON.parse(pollResponse.getContentText());
    } while (pollResult.RequestStatus !== "Completed");

    // Step 3: Download and process the file
    const downloadResponse = EnvironmentAdapter.fetch(pollResult.ResultFileUrl);
    const files = EnvironmentAdapter.unzip(downloadResponse.getBlob());
    
    // Process all data from the files
    const allData = [];
    for (const file of files) {
      const csvData = EnvironmentAdapter.parseCsv(file.getDataAsString());

      const filteredCsv = csvData.filter((row, idx) =>
        idx === 0 || row[0] !== "Format Version"
      );

      const rawHeaders = filteredCsv[0];
      const headers = rawHeaders.map(h => h.replace(/[^a-zA-Z0-9]/g, ""));

      for (let i = 1; i < filteredCsv.length; i++) {
        const rowObj = {};
        for (let j = 0; j < headers.length; j++) {
          rowObj[headers[j]] = filteredCsv[i][j];
        }
        allData.push(rowObj);
      }
    }

    return this._filterByFields(allData, fields);
  }

  /**
   * Fetch ad performance report data
   */
  _fetchAdPerformanceReport({ accountId, fields, start_time, end_time }) {
    // Update access token
    this.getAccessToken();

    const dateRange = {
      "CustomDateRangeStart": {
        "Day": new Date(start_time).getDate(),
        "Month": new Date(start_time).getMonth() + 1,
        "Year": new Date(start_time).getFullYear()
      },
      "CustomDateRangeEnd": {
        "Day": new Date(end_time).getDate(),
        "Month": new Date(end_time).getMonth() + 1,
        "Year": new Date(end_time).getFullYear()
      },
      "ReportTimeZone": this.config.ReportTimezone.value
    };

    // Report request configuration
    const submitUrl = "https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Submit";
    const reportRequest = {
      "ExcludeColumnHeaders": false,
      "ExcludeReportFooter": true,
      "ExcludeReportHeader": true,
      "ReportName": "Ad Performance Report",
      "ReturnOnlyCompleteData": false,
      "Type": "AdPerformanceReportRequest",
      "Aggregation": this.config.Aggregation.value,
      "Columns": fields,
      "Scope": {"AccountIds": [Number(accountId)]},
      "Time": dateRange
    };

    const submitOptions = {
      "method": "post",
      "contentType": "application/json",
      "headers": {
        "Authorization": "Bearer " + this.config.AccessToken.value,
        "CustomerAccountId": this.config.CustomerID.value + "|" + accountId,
        "CustomerId": this.config.CustomerID.value,
        "DeveloperToken": this.config.DeveloperToken.value
      },
      "payload": JSON.stringify({"ReportRequest": reportRequest})
    };

    // Submit report request
    const submitResponse = EnvironmentAdapter.fetch(submitUrl, submitOptions);

    // Check report status
    const pollUrl = "https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Poll";
    const pollOptions = JSON.parse(JSON.stringify(submitOptions));
    pollOptions.payload = submitResponse.getContentText();
    
    let pollResponseObject;
    do {
      const pollResponse = EnvironmentAdapter.fetch(pollUrl, pollOptions);
      pollResponseObject = JSON.parse(pollResponse.getContentText());
      if (pollResponseObject.ReportRequestStatus.Status != "Success") {
        EnvironmentAdapter.sleep(5000); // Wait 5 seconds between polls
      }
    } while (pollResponseObject.ReportRequestStatus.Status != "Success");

    // Download and process report
    const downloadResponse = EnvironmentAdapter.fetch(pollResponseObject.ReportRequestStatus.ReportDownloadUrl);
    const csvData = EnvironmentAdapter.parseCsv(EnvironmentAdapter.unzip(downloadResponse.getBlob())[0].getDataAsString());

    // Transform CSV to JSON
    const result = [];
    const headers = csvData[0].map(header => header.replaceAll(/[^a-zA-Z0-9]/gi, ""));
    
    for (let i = 1; i < csvData.length; i++) {
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = csvData[i][j];
      }
      result.push(row);
    }

    return this._filterByFields(result, fields);
  }
};
