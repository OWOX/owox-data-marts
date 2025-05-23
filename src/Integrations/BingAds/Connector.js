/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
// API Documentation: https://learn.microsoft.com/en-us/advertising/reporting-service/reporting-service-reference

var BingConnector = class BingConnector extends AbstractConnector {
  //---- constructor -------------------------------------------------
    constructor(config) {
      //fields parsing
        let fields = config.Fields.value.split(",");
        let storageKeys = [];
        let storageFields = {};
        for (var i = 0; i < fields.length; i++) {
          fields[i] = fields[i].trim();
          if (fields[i].indexOf("Id") != -1) storageKeys.push(fields[i]);
          storageFields[fields[i]] = {
            type: "string",
            description: ""
          };
        }
        if (fields.includes("TimePeriod")) storageKeys.push("TimePeriod");

      super(config.mergeParameters({
        AccountID: {
          isRequired: true,
          requiredType: "string"
        },
        CustomerID: {
          isRequired: true,
          requiredType: "string"
        },
        DeveloperToken: {
          isRequired: true,
          requiredType: "string"
        },
        ClientID: {
          isRequired: true,
          requiredType: "string"
        },
        ClientSecret: {
          isRequired: true,
          requiredType: "string"
        },
        RefreshToken: {
          isRequired: true,
          requiredType: "string"
        },
        StartDate: {
          isRequired: true,
          requiredType: "date",
          default: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        },
        EndDate: {
          requiredType: "date",
        },
        Fields: { //for Bing Ads API
          isRequired: true,
          value: fields
        },
        Schema: { //for Google Sheets Storage
          isRequired: true,
          value: storageFields
        },
        UniqueKeys: { //for Google Sheets Storage
          isRequired: true,
          value: storageKeys
        },
        ReportTimezone: {
          isRequired: true,
          requiredType: "string"
        },
        ReimportLookbackWindow: {
          requiredType: "number",
          isRequired: true
        },
        MaxFetchingDays: {
          requiredType: "number",
          isRequired: true,
          value: 30
        }
      }));
    }
    //----------------------------------------------------------------
  
  //---- getAccessToken ----------------------------------------------
    getAccessToken() {
      // request configuration
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
          //'muteHttpExceptions': true
        };
      
      // request execution
        const response = UrlFetchApp.fetch(url, options);
      
      // access token updating
        const responseObject = JSON.parse(response.getContentText());
        const accessToken = responseObject.access_token;
        this.config.AccessToken = {
          value: accessToken
        };
    }
    //----------------------------------------------------------------
  
  //---- fetchData ---------------------------------------------------
    /**
     * @param date The requested date as a Date object
     * @return data array
     */
    fetchData(startDate, endDate) {
      // initialization
        let data = [];
      
      // date range definition
        const dateRange = {
          "CustomDateRangeStart": {
            "Day": startDate.getDate(),
            "Month": startDate.getMonth()+1,
            "Year": startDate.getFullYear()
          },
          "CustomDateRangeEnd": {
            "Day": endDate.getDate(),
            "Month": endDate.getMonth()+1,
            "Year": endDate.getFullYear()
          },
          "ReportTimeZone": this.config.ReportTimezone.value
        };

      // access token updating
        this.getAccessToken();

      // report request configuration
        const submitUrl = "https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Submit";
        const reportRequest = {
          "ExcludeColumnHeaders": false,
          "ExcludeReportFooter": true,
          "ExcludeReportHeader": true,
          "ReportName": "Custom Report",
          "ReturnOnlyCompleteData": false,
          "Type": "AdPerformanceReportRequest",
          "Aggregation": this.config.Aggregation.value,
          "Columns": this.config.Fields.value,
          "Scope": {"AccountIds": [Number(this.config.AccountID.value)]},
          "Time": dateRange
        };
        const submitOptions = {
          "method": "post",
          "contentType": "application/json",
          "headers": {
            "Authorization": "Bearer "+this.config.AccessToken.value,
            "CustomerAccountId": this.config.CustomerID.value+"|"+this.config.AccountID.value,
            "CustomerId": this.config.CustomerID.value,
            "DeveloperToken": this.config.DeveloperToken.value
          },
          "payload": JSON.stringify({"ReportRequest": reportRequest})
          //"muteHttpExceptions": true
        };

      // report request execution
        const submitResponse = UrlFetchApp.fetch(submitUrl, submitOptions);

      // report request status check
        var pollUrl = "https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Poll";
        var pollOptions = JSON.parse(JSON.stringify(submitOptions));
        pollOptions.payload = submitResponse.getContentText();
        do {
          const pollResponse = UrlFetchApp.fetch(pollUrl, pollOptions);
          var pollResponseObject = JSON.parse(pollResponse.getContentText());
        } while (pollResponseObject.ReportRequestStatus.Status != "Success");
        
      // report downloading
        const downloadResponse = UrlFetchApp.fetch(pollResponseObject.ReportRequestStatus.ReportDownloadUrl);

      // unzip and parsing data
        const csvData = Utilities.parseCsv(Utilities.unzip(downloadResponse.getBlob())[0].getDataAsString());

      // csv to json data transformation
        for (var column = 0; column < csvData[0].length; column++) {
          csvData[0][column] = csvData[0][column].replaceAll(/[^a-zA-Z0-9]/gi, "");
        }
        for (var row = 1; row < csvData.length; row++) {
          var temporaryObject = {};
          for (var column = 0; column < csvData[0].length; column++) {
            temporaryObject[csvData[0][column]] = csvData[row][column];
          }
          data.push(temporaryObject);
        }
        
      return data;
    }
    //----------------------------------------------------------------
}