/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// Google Sheets Range with config data. Must refer to a table with three columns: name, value and comment
var CONFIG_RANGE = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config').getRange("A:C");

function onOpen() {
  SpreadsheetApp.getUi().createMenu('OWOX')
    .addItem('▶ Import New Data', 'importNewData')
    .addItem('📅 Manual Backfill', 'manualBackfill')
    .addItem('🔑 Manage Credentials', 'manageCredentials')
    .addItem('⏰ Schedule', 'scheduleRuns')
    .addItem('📋 Update Fields Sheet', 'updateFieldsSheet')
    .addToUi();
}

function importNewData(importType = OWOX.RUN_CONFIG_TYPE.INCREMENTAL, params = null) {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const properties = PropertiesService.getDocumentProperties().getProperties();
    const source = new OWOX.RedditAdsSource(config.setParametersValues(properties));
  const runConfig = new OWOX.AbstractRunConfig({
    type: importType,
    data: params || []
  });

  const connector = new OWOX.RedditAdsConnector(
    config, 
    source,
    "GoogleSheetsStorage", // storage name, e.g., "GoogleSheetsStorage", "GoogleBigQueryStorage"
    runConfig
  );

  connector.run();
} 

function manualBackfill() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const properties = PropertiesService.getDocumentProperties().getProperties();
  const source = new OWOX.RedditAdsSource(config.setParametersValues(properties));
  
  config.showManualBackfillDialog(source);
}

function executeManualBackfill(params) {
  importNewData(OWOX.RUN_CONFIG_TYPE.MANUAL_BACKFILL, params);
}

function updateFieldsSheet() {
  const config = new OWOX.GoogleSheetsConfig( CONFIG_RANGE );

  config.updateFieldsSheet(
    new OWOX.RedditAdsSource(config.setParametersValues({
      "ClientId": "undefined", 
      "ClientSecret": "undefined", 
      "RedirectUri": "undefined",
      "UserAgent": "undefined", 
      "RefreshToken": "undefined", 
      "Fields": "undefined"
    }))
  );
}

function manageCredentials(credentials) {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();

  if (!credentials) {
    // Show credentials dialog
    const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
      const source = new OWOX.RedditAdsSource(config);
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

    ui.alert('✅ Credentials saved successfully');
  } catch (e) {
    console.error('Error saving credentials:', e);
    ui.alert('❌ Error saving credentials: ' + e.message);
  }
}

function scheduleRuns() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Schedule Runs',
    'To schedule runs, you need to add a time trigger. Details: https://github.com/OWOX/js-data-connectors/issues/47',
    ui.ButtonSet.OK_CANCEL
  );
}

function checkForTimeout() {
  var config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  config.checkForTimeout();
}
