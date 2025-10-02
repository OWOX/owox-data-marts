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
    .addItem('▶ Import New Data', 'importNewData')
    .addItem('📅 Manual Backfill', 'manualBackfill')
    .addItem('🧹 CleanUp Expired Data', 'cleanUpExpiredData')
    .addItem('🔑 Manage Credentials', 'manageCredentials')
    .addItem('⏰ Schedule', 'scheduleRuns')
    .addItem('📋 Update Fields Sheet', 'updateFieldsSheet')
    .addToUi();
}

function importNewData(importType = OWOX.RUN_CONFIG_TYPE.INCREMENTAL, params = null) {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const properties = PropertiesService.getDocumentProperties().getProperties();
  const source = new OWOX.FacebookMarketingSource(config.setParametersValues(properties));
  const runConfig = new OWOX.AbstractRunConfig({
    type: importType,
    data: params || []
  });
  
  const connector = new OWOX.FacebookMarketingConnector(
    config,
    source,
    "GoogleSheetsStorage", // storage name, e.g., "GoogleSheetsStorage", "GoogleBigQueryStorage"
    runConfig
  );

  connector.run();
}

function manualBackfill() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const source = new OWOX.FacebookMarketingSource(config.setParametersValues(
    PropertiesService.getDocumentProperties().getProperties()
  ));
  
  config.showManualBackfillDialog(source);
}

function executeManualBackfill(params) {
  importNewData(OWOX.RUN_CONFIG_TYPE.MANUAL_BACKFILL, params);
}

function cleanUpExpiredData() {

  const storage = new OWOX.GoogleSheetsStorage( 
    new OWOX.GoogleSheetsConfig( CONFIG_RANGE ),
    ["campaignName", "date"] 
  );
  storage.cleanUpExpiredData("date");

}

function updateFieldsSheet() {

  const config = new OWOX.GoogleSheetsConfig( CONFIG_RANGE );

  config.updateFieldsSheet(
    new OWOX.FacebookMarketingSource( config.setParametersValues( {"AccessToken": "undefined", "Fields": "undefined"} ))
  );

}

function manageCredentials() {

  const ui = SpreadsheetApp.getUi();
  const Properties = PropertiesService.getDocumentProperties();
  const currentKey = Properties.getProperty('AccessToken');
  const response = ui.prompt(
    currentKey ? 'Update your Access Token' : 'Add your Access Token',
    'To import data from Facebook Marketing API, you need to add an Access Token. Here\'s how you can get it: https://github.com/OWOX/owox-data-marts/tree/main/packages/connectors/src/Sources/FacebookMarketing',
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

function checkForTimeout() {
  var config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  config.checkForTimeout();
}
