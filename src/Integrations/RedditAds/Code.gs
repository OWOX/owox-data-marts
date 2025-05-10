// Google Sheets Range with config data. Must me referes to a table with three columns: name, value and comment
var CONFIG_RANGE = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config').getRange("A:C");

function onOpen() {
  SpreadsheetApp.getUi().createMenu('OWOX')
    .addItem('▶ Import New Data', 'importNewData')
    .addItem('🧹 CleanUp Expired Data', 'cleanUpExpiredData')
    .addItem('🔑 Manage Credentials', 'showConnectorSidebar')
    .addItem('⏰ Schedule', 'scheduleRuns')
    .addItem('📋 Update Fields Sheet', 'updateFieldsSheet')
    .addSeparator()
    .addItem('🛠 Reddit Ads Integration', 'showConnectorSidebar')
    .addToUi();
}

function importNewData() {

  const config = new Reddit_Integration.GoogleSheetsConfig( CONFIG_RANGE );
  
  const pipeline = new Reddit_Integration.RedditPipeline(
    config,                                                           // pipeline configuration
    new Reddit_Integration.RedditConnector( config.setParametersValues(  // connector with parameter's values added from properties 
      PropertiesService.getDocumentProperties().getProperties()
    ) )
  );

  pipeline.run();

}

function cleanUpExpiredData() {

  const storage = new Reddit_Integration.GoogleSheetsStorage( 
    new Reddit_Integration.GoogleSheetsConfig( CONFIG_RANGE ),
    ["campaignName", "date"] 
  );
  storage.cleanUpExpiredData("date");

}

function showIntegrationSidebar() {
  var htmlOutput = Reddit_Integration.Reddit_Integration_Menu.getHtmlTemplate();
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

function updateFieldsSheet() {

  const config = new Reddit_Integration.GoogleSheetsConfig( CONFIG_RANGE );

  config.updateFieldsSheet(
    new Reddit_Integration.RedditConnector( 
      config.setParametersValues( {"AccoundIDs": "undefined", "AccessToken": "undefined", "Fields": "undefined"} )
    )
  );

}

function manageCredentials() {

  const ui = SpreadsheetApp.getUi();
  const Properties = PropertiesService.getDocumentProperties();
  const currentKey = Properties.getProperty('AccessToken');
  const response = ui.prompt(
    currentKey ? 'Update your Access Token' : 'Add your Access Token',
    'To import data from Reddit API, you need to add an Access Token. Here’s how you can get it: https://github.com/OWOX/js-data-connectors/tree/main/src/Integrations/FacebookMarketing',
    ui.ButtonSet.OK_CANCEL
  );

  // Check the user's response
  if (response.getSelectedButton() === ui.Button.OK) {
    const newKey = response.getResponseText(); 

    if( currentKey && newKey === "" ) {
      
      Properties.deleteProperty('AccessToken');
      ui.alert('☑️ Saved Access Token was deleted');

    } else if( !/^[A-Za-z0-9]{150,}$/.test(newKey) ) {
      ui.alert('❌ The provided Access Token has an incorrect format');

    } else {
      // Save the input to document properties
      Properties.setProperty('AccessToken', newKey);

    }
    
  } 

}

function saveProperty(key, value) {
  var properties = PropertiesService.getDocumentProperties();
  properties.setProperty(key, value);
}
function getProperty(key) {
  var properties = PropertiesService.getDocumentProperties();
  return properties.getProperty(key);
}
function deleteProperty(key) {
  var properties = PropertiesService.getDocumentProperties();
  properties.deleteProperty(key);
}

function getSavedCredentials() {
  var properties = PropertiesService.getDocumentProperties();
  Properties.setProperty('AccessToken', newKey);
  Logger.log(properties.getProperty("testId"))
  return {
    clientId: properties.getProperty("testId"),
    // clientSecret: properties.getProperty("clientSecret"),
    // redirectUri: properties.getProperty("redirectUri"),
    // refreshToken: properties.getProperty("refreshToken")
  };
}



function credsTest(){
  deleteProperty("AccessToken")
  var testId = getProperty("AccessToken")
  Logger.log(testId)
}




/**
 * Opens the sidebar for managing Reddit API credentials.
 * Generates an HTML sidebar with input fields and validation.
 */
function showConnectorSidebar() {
  const connectorName = "Reddit";

  // Define the fields required for authentication
  const fields = [
    { paramName: "AppName", regex_Rule: "", paramTip: "Your Reddit App Name.", tipLink: "https://www.reddit.com/prefs/apps", required: true },
    { paramName: "AppCode", regex_Rule: "", paramTip: "Your Reddit App Code (Type: Script/Web App).", required: false },
    { paramName: "ClientId", regex_Rule: "", paramTip: "Generated in Reddit Developer Portal.", tipLink: "https://www.reddit.com/prefs/apps", required: true },
    { paramName: "ClientSecret", regex_Rule: "", paramTip: "Generated in Reddit Developer Portal.", required: true },
    { paramName: "RedirectUri", regex_Rule: "", paramTip: "The URL where Reddit will redirect after authentication.", required: true },
    { paramName: "RefreshToken", regex_Rule: "", paramTip: "Generated after OAuth authentication.", tipLink: "https://github.com/reddit-archive/reddit/wiki/OAuth2", required: true }
  ];
  
  const validationFunction = "validateRedditToken"; // Function used to validate credentials
  var htmlOutput = Reddit_Integration.Universal_Connector_Menu.getHtmlTemplate(connectorName, fields, validationFunction);
  SpreadsheetApp.getUi().showSidebar(htmlOutput); // Display the sidebar
}

/**
 * Saves the provided credentials in Google Sheets PropertiesService.
 * @param {Object} data - Key-value pairs of credentials to save.
 */
function saveProperties(data) {
  var properties = PropertiesService.getDocumentProperties();
  for (var key in data) {
    properties.setProperty(key, data[key]); // Store each parameter
  }
}

/**
 * Validates the Reddit API credentials by attempting to obtain an access token.
 * @param {Object} data - Object containing the credentials to validate.
 * @returns {boolean} - Returns true if credentials are valid, otherwise false.
 */
function validateRedditToken(data) {
  var url = "https://www.reddit.com/api/v1/access_token";

  // Construct headers with Base64 authentication
  var headers = {
    "User-Agent": data.AppName, // Required by Reddit API
    "Content-Type": "application/x-www-form-urlencoded",
    "Authorization": "Basic " + Utilities.base64Encode(data.ClientId + ":" + data.ClientSecret)
  };

  // Request payload for refreshing the access token
  var payload = {
    "grant_type": "refresh_token",
    "redirect_uri": data.RedirectUri,
    "refresh_token": data.RefreshToken
  };

  // Define fetch options
  var options = {
    "method": "post",
    "headers": headers,
    "payload": payload,
    "muteHttpExceptions": true // Prevents script from crashing on error response
  };

  try {
    var response = UrlFetchApp.fetch(url, options); // Send API request
    Logger.log(response);
    var json = JSON.parse(response.getContentText());

    return json.access_token ? true : false; // Return validation result
  } catch (e) {
    return false; // Return false if an error occurs
  }
}




