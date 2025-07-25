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
    .addItem('🔧 Manual Backfill', 'manualBackfill')
    .addItem('🔑 Manage Credentials', 'manageCredentials')
    .addItem('⏰ Schedule', 'scheduleRuns')
    .addItem('📋 Update Fields Sheet', 'updateFieldsSheet')
    .addToUi();
}

function importNewData() {

  const config = new OWOX.GoogleSheetsConfig( CONFIG_RANGE );
  
  const runConfig = OWOX.AbstractRunConfig.createIncremental();

  const connector = new OWOX.BingAdsConnector(
    config,
    new OWOX.BingAdsSource( config.setParametersValues(  // source with parameter's values added from properties 
      PropertiesService.getDocumentProperties().getProperties()
    ) ),
    "GoogleSheetsStorage", // storage
    runConfig
  );

  connector.run();

}

function manualBackfill() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const source = new OWOX.BingAdsSource(config.setParametersValues(
    PropertiesService.getDocumentProperties().getProperties()
  ));
  
  config.showManualBackfillDialog(source);
}

function executeManualBackfill(params) {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  
  const runConfig = OWOX.AbstractRunConfig.createManualBackfill(params);
  
  const connector = new OWOX.BingAdsConnector(
    config,
    new OWOX.BingAdsSource(config.setParametersValues(
      PropertiesService.getDocumentProperties().getProperties()
    )),
    "GoogleSheetsStorage", // storage
    runConfig
  );

  connector.run();
}

function updateFieldsSheet() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);

  config.updateFieldsSheet(
    new OWOX.BingAdsSource(config.setParametersValues({
      "DeveloperToken": "undefined",
      "ClientID": "undefined",
      "ClientSecret": "undefined",
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
      const source = new OWOX.BingAdsSource(config);
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

function scheduleRuns() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Schedule Runs',
    'To schedule runs, you need to add a time trigger. Details: https://github.com/OWOX/owox-data-marts/issues/47',
    ui.ButtonSet.OK_CANCEL
  );
} 

function checkForTimeout() {
  var config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  config.checkForTimeout();
} 
