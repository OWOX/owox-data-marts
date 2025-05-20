var CriteoConnector = class CriteoConnector extends AbstractConnector {

  constructor(configRange) {

    super(configRange.mergeParameters({
      StandardSource: {
        isRequired: true,
        requiredType: "string",
      },
      StandardMedium: {
        isRequired: true,
        requiredType: "string",
      },
      StartDate: {
        isRequired: true,
        requiredType: "date",
      },
      EndDate: {
        isRequired: false,
        requiredType: "date",
      },
      AccountID: {
        isRequired: true,
      },
      Token: {
        requiredType: "string"
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 5
      },
      CleanUpToKeepWindow: {
        requiredType: "number"
      },
      ClientId: {
        isRequired: true,
        requiredType: "string"
      },
      Secret: {
        isRequired: true,
        requiredType: "string"
      },
      MaxFetchingDays: {
        requiredType: "number",
        value: 30
      }
    }));
  }

  /**
   * Fetching data
   * @param startDate - date we are working with (just one for one fetch)
   */
  fetchData(startDate) {
    //checking, if we already have token in config. for 1+ "cycle parts"
    if (!this.config.Token) {
      this.getToken()
    };
    const urlOfAPI = 'https://api.criteo.com/2024-10/statistics/report';
    // Query options
    const options = {
      method: 'post',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
      },
      //stringify, as soon as we sending json in content-type
      payload: JSON.stringify({
        advertiserIds: this.config.AccountID.value.toString(),
        timezone: "UTC",
        dimensions: [
          "Campaign", "CampaignId", "AdvertiserId", "Adset", "Ad"
        ],
        currency: "USD", //@TODO currency in interface
        format: "json",
        startDate: startDate,
        endDate: startDate,
        metrics: ["Clicks", "Displays", "AdvertiserCost"]
      }),
    };
    let response = "";
    let amountOfTriesBecauseTokenLives15Minutes = 2; 

    for (var a = 1; a <= amountOfTriesBecauseTokenLives15Minutes; a++) {  
      try {
        options.headers.authorization = "Bearer " + this.config.Token.value;
        response = UrlFetchApp.fetch(urlOfAPI, options);
        break;
      } catch (err) {
        this.takeToken();
      }
    }
    let answerCode = response.getResponseCode();
    // Let's check our response code
    if (answerCode == 200) {
      var jsonObject = JSON.parse(response.getContentText())
      var parsedAndEnrichedData = this.parsedAndAddedDataResponse(jsonObject, startDate);
      return parsedAndEnrichedData;
    } else {
      throw new Error(`Error (${answerCode}): ${answerCode}`);

    }
  }
  /**
 * Taking token from API. 
 * Docs: https://developers.criteo.com/marketing-solutions/docs/authorization-code-setup
 */
  takeToken() {
    const url = 'https://api.criteo.com/oauth2/token';
    const options = {
      method: 'post',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: {
        grant_type: 'client_credentials',
        client_id: this.config.ClientId.value,
        client_secret: this.config.Secret.value
      },
      muteHttpExceptions: true // Error catching
    };
    try {
      // Here we're doing our post request
      const response = UrlFetchApp.fetch(url, options);
      // results
      const json = JSON.parse(response.getContentText());
      let token = json["access_token"];
      this.config.Token = {
        value: token
      };
    } catch (err) {
      // Errors logging. 
      Logger.log(`Error: ${err}`);
    }
  }
  /**
   * Parsing json-fied data, getting values, and enrich it with source / medium
   * @param objectToParse
   * @paramDate
   * @return Enriched object. 
   */
  parsedAndAddedDataResponse(objectToParse, date) {
    var goodData = [];
    var rows = objectToParse["Rows"];
    var renewedDate = Utilities.formatDate(date, "UTC", "yyyy-MM-dd"); // The requested date in YYYY-MM-DD format (required)
    for (let i = 0; i < rows.length; i++) {
      let oneObject = rows[i];
      goodData.push({
        Date: new Date(renewedDate),
        source: this.config.StandardSource.value.toString(),
        medium: this.config.StandardMedium.value.toString(),
        account: oneObject["AdvertiserId"],//@TODO Connect with query, object data and schema (data sheet)
        campaign: oneObject["Campaign"],
        campaignId: oneObject["CampaignId"],
        keyword: oneObject["Ad"],
        adCost: oneObject["AdvertiserCost"],
        adClicks: oneObject["Clicks"],
        impressions: oneObject["Displays"],
        currency: oneObject["Currency"]
      });
      Logger.log(goodData[i]);
    }
    return goodData;
  }
}

