/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// Google Sheets Range with config data. Must me referes to a table with three columns: name, value and comment
var CONFIG_RANGE = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config').getRange("A:C");

function onOpen() {
  SpreadsheetApp.getUi().createMenu('OWOX')
    .addItem('▶ Import New Data', 'startImportProcess')
    .addItem('🔑 Manage Credentials', 'manageCredentials')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('⏰ Schedule')
      .addItem('Set Daily Schedule (5 AM)', 'createDailyTrigger')
      .addItem('Set Hourly Schedule', 'createHourlyTrigger')
      .addItem('Set Custom Schedule', 'createCustomTrigger')
      .addItem('Delete All Schedules', 'deleteTriggers'))
    .addItem('📋 Update Fields Sheet', 'updateFieldsSheet')
    .addItem('🧹 CleanUp Expired Data', 'cleanUpExpiredData')
    .addItem('✔️ Test Connection', 'testConnection')
    .addItem('🔎 Get OAuth URL', 'getOAuthUrl')
    .addToUi();
}

/**
 * Runs the import process based on the configuration in the Google Sheet.
 */
function startImportProcess() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const properties = PropertiesService.getDocumentProperties().getProperties();
  const source = new OWOX.TikTokAdsSource(config.setParametersValues(properties));
  const pipeline = new OWOX.TikTokAdsPipeline(
    config,
    source,
    "GoogleSheetsStorage"
    // "GoogleBigQueryStorage"
  );

  pipeline.run();
}

function manageCredentials(credentials) {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();

  if (!credentials) {
    // Show credentials dialog
    const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
      const source = new OWOX.TikTokAdsSource(config);
  return config.showCredentialsDialog(source, props);
  }

  try {
    // Save credentials in the spreadsheet-bound properties
    Object.entries(credentials).forEach(([key, value]) => {
      if (value) {
        props.setProperty(key, value);
      } else {
        props.deleteProperty(key);
      }
    });
    
    console.log('Saved properties:', props.getProperties());
    ui.alert('✅ Credentials saved successfully');
  } catch (e) {
    console.error('Error saving credentials:', e);
    ui.alert('❌ Error saving credentials: ' + e.message);
  }
}

function updateFieldsSheet() {
  const config = new OWOX.GoogleSheetsConfig( CONFIG_RANGE );

  config.updateFieldsSheet(
    new OWOX.TikTokAdsSource(config.setParametersValues({
      "AccessToken": "undefined", 
      "AppId": "undefined",
      "AppSecret": "AppSecret", 
      "Fields": "undefined"
    }))
  );
}

/**
 * Creates a time-based trigger to run the import process daily.
 */
function createDailyTrigger() {
  try {
    // Delete any existing triggers with the same function name
    deleteTriggers();
    
    // Create a new trigger to run daily
    ScriptApp.newTrigger('startImportProcess')
      .timeBased()
      .everyDays(1)
      .atHour(5) // 5 AM in the script's timezone
      .create();
    
    // Get the active spreadsheet and the 'Config' sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = spreadsheet.getSheetByName('Config');
    
    if (!configSheet) {
      throw new Error("Config sheet not found in the active spreadsheet");
    }
    
    // Get the config range (assuming parameters are in columns A and B)
    var configRange = configSheet.getRange("A:B");
    
    var config = new OWOX.GoogleSheetsConfig(configRange);
    config.logMessage("✅ Daily trigger set to run at 5 AM");
  } catch (error) {
    console.error(`Error creating trigger: ${error}`);
    console.error(error.stack);
    if (config) {
      config.logMessage(`❌ Error creating trigger: ${error.message}`);
    }
  }
}

/**
 * Creates a time-based trigger to run the import process hourly.
 */
function createHourlyTrigger() {
  try {
    // Delete any existing triggers with the same function name
    deleteTriggers();
    
    // Create a new trigger to run hourly
    ScriptApp.newTrigger('startImportProcess')
      .timeBased()
      .everyHours(1)
      .create();
    
    // Get the active spreadsheet and the 'Config' sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = spreadsheet.getSheetByName('Config');
    
    if (!configSheet) {
      throw new Error("Config sheet not found in the active spreadsheet");
    }
    
    // Get the config range (assuming parameters are in columns A and B)
    var configRange = configSheet.getRange("A:B");
    
    var config = new OWOX.GoogleSheetsConfig(configRange);
    config.logMessage("✅ Hourly trigger set");
  } catch (error) {
    console.error(`Error creating trigger: ${error}`);
    console.error(error.stack);
    if (config) {
      config.logMessage(`❌ Error creating trigger: ${error.message}`);
    }
  }
}

/**
 * Creates a custom scheduled trigger.
 */
function createCustomTrigger() {
  try {
    // Delete any existing triggers with the same function name
    deleteTriggers();
    
    // Get the active spreadsheet and the 'Config' sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = spreadsheet.getSheetByName('Config');
    
    if (!configSheet) {
      throw new Error("Config sheet not found in the active spreadsheet");
    }
    
    // Get the config range (assuming parameters are in columns A and B)
    var configRange = configSheet.getRange("A:B");
    
    // Get the custom schedule configuration
    var config = new OWOX.GoogleSheetsConfig(configRange);
    var customHour = parseInt((config.ScheduleHour && config.ScheduleHour.value) || "5", 10);
    var customMinute = parseInt((config.ScheduleMinute && config.ScheduleMinute.value) || "0", 10);
    
    // Validate hour and minute
    customHour = Math.max(0, Math.min(23, customHour));
    customMinute = Math.max(0, Math.min(59, customMinute));
    
    // Create a new trigger with custom schedule
    ScriptApp.newTrigger('startImportProcess')
      .timeBased()
      .everyDays(1)
      .atHour(customHour)
      .nearMinute(customMinute)
      .create();
    
    config.logMessage(`✅ Daily trigger set to run at ${customHour}:${customMinute < 10 ? '0' + customMinute : customMinute}`);
  } catch (error) {
    console.error(`Error creating custom trigger: ${error}`);
    console.error(error.stack);
    if (config) {
      config.logMessage(`❌ Error creating custom trigger: ${error.message}`);
    }
  }
}

/**
 * Deletes all triggers associated with this script.
 */
function deleteTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'startImportProcess') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * Tests the connection to the TikTok Ads API.
 */
function testConnection() {
  try {
    // Get the active spreadsheet and the 'Config' sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = spreadsheet.getSheetByName('Config');
    
    if (!configSheet) {
      throw new Error("Config sheet not found in the active spreadsheet");
    }
    
    // Get the config range (assuming parameters are in columns A and B)
    var configRange = configSheet.getRange("A:B");
    
    var config = new OWOX.GoogleSheetsConfig(configRange);
    var source = new OWOX.TikTokAdsSource(config);
    
    // Try to fetch advertiser data
    var advertiserIds = String(config.AdvertiserIDs && config.AdvertiserIDs.value || "").split(/[,;]\s*/);
    
    if (!advertiserIds || advertiserIds.length === 0 || advertiserIds[0] === "") {
      config.logMessage("❌ No advertiser IDs specified. Please configure AdvertiserIDs parameter.");
      return;
    }
    
    var testAdvertiserId = advertiserIds[0];
    config.logMessage(`🔄 Testing connection for advertiser ID: ${testAdvertiserId}`);
    
    // Make sure we have the app_id
    var appId = config.AppId && config.AppId.value;
    
    if (!appId) {
      config.logMessage("❌ AppId parameter not found. Please configure it in the Config sheet.");
      return;
    }
    
    // Make sure we have the app_secret
    var appSecret = config.AppSecret && config.AppSecret.value;
    
    if (!appSecret) {
      config.logMessage("❌ AppSecret parameter not found. Please configure it in the Config sheet.");
      return;
    }
    
    // Pass app_id and app_secret to the source
    source.appId = appId;
    source.appSecret = appSecret;
    
    var data = source.fetchData("advertiser", testAdvertiserId, ["advertiser_id", "advertiser_name"]);
    
    if (data && data.length > 0) {
      config.logMessage(`✅ Connection successful! Advertiser name: ${data[0].advertiser_name}`);
    } else {
      config.logMessage("⚠️ Connection successful but no advertiser data returned.");
    }
  } catch (error) {
    console.error(`Error testing connection: ${error}`);
    console.error(error.stack);
    if (config) {
      config.logMessage(`❌ Connection failed: ${error.message}`);
      
      // Provide more helpful error messages for common issues
      if (error.message.includes("Access Token")) {
        config.logMessage("ℹ️ Please check your Access Token. TikTok access tokens expire after 24 hours.");
      } else if (error.message.includes("advertiser")) {
        config.logMessage("ℹ️ Please check your Advertiser IDs. Make sure they are correct and accessible with your credentials.");
      } else if (error.message.includes("rate limit")) {
        config.logMessage("ℹ️ Rate limit exceeded. Please try again later.");
      }
    }
  }
}

/**
 * Returns an OAuth URL that will authorize this script to access
 * TikTok on the user's behalf.
 */
function getOAuthUrl() {
  try {
    // Get the active spreadsheet and the 'Config' sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = spreadsheet.getSheetByName('Config');
    
    if (!configSheet) {
      throw new Error("Config sheet not found in the active spreadsheet");
    }
    
    // Get the config range (assuming parameters are in columns A and B)
    var configRange = configSheet.getRange("A:B");
    
    var config = new OWOX.GoogleSheetsConfig(configRange);
    var appId = config.AppId && config.AppId.value;
    var appSecret = config.AppSecret && config.AppSecret.value;
    var redirectUri = (config.RedirectUri && config.RedirectUri.value) || ScriptApp.getService().getUrl();
    
    if (!appId) {
      config.logMessage("❌ AppId parameter not found. Please configure it in the Config sheet.");
      return;
    }
    
    if (!appSecret) {
      config.logMessage("❌ AppSecret parameter not found. Please configure it in the Config sheet.");
      return;
    }
    
    var authUrl = "https://ads.tiktok.com/marketing_api/auth" +
      "?app_id=" + encodeURIComponent(appId) +
      "&secret=" + encodeURIComponent(appSecret) +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&state=state123" +
      "&scope=ads.read,advertiser.read";
    
    config.logMessage("Please visit the following URL to authorize this script:");
    config.logMessage(authUrl);
    
    return authUrl;
  } catch (error) {
    console.error(`Error generating OAuth URL: ${error}`);
    console.error(error.stack);
    if (config) {
      config.logMessage(`❌ Error: ${error.message}`);
    }
  }
}

/**
 * Cleans up old data based on CleanUpToKeepWindow configuration.
 */
function cleanUpExpiredData() {
  try {
    // Get the active spreadsheet and the 'Config' sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = spreadsheet.getSheetByName('Config');
    
    if (!configSheet) {
      throw new Error("Config sheet not found in the active spreadsheet");
    }
    
    // Get the config range (assuming parameters are in columns A and B)
    var configRange = configSheet.getRange("A:B");
    
    var config = new OWOX.GoogleSheetsConfig(configRange);
    var source = new OWOX.TikTokAdsSource(config);
    var pipeline = new OWOX.TikTokAdsPipeline(config, source);
    
    config.logMessage("🔄 Starting data cleanup process...");
    pipeline.cleanUpExpiredData();
    config.logMessage("✅ Data cleanup completed");
  } catch (error) {
    console.error(`Error during data cleanup: ${error}`);
    console.error(error.stack);
    if (config) {
      config.logMessage(`❌ Error: ${error.message}`);
    }
  }
}
