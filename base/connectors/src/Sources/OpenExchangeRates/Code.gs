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
    .addToUi();
}

function importNewData(importType = OWOX.RUN_CONFIG_TYPE.INCREMENTAL, params = null) {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const properties = PropertiesService.getDocumentProperties().getProperties();
  const source = new OWOX.OpenExchangeRatesSource(config.setParametersValues(properties));
  const runConfig = new OWOX.AbstractRunConfig({
    type: importType,
    data: params || []
  });
  
  const connector = new OWOX.OpenExchangeRatesConnector(
    config,
    source,
    "GoogleSheetsStorage", // storage name, e.g., "GoogleSheetsStorage", "GoogleBigQueryStorage"
    runConfig
  );

  connector.run();
}

function manualBackfill() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const source = new OWOX.OpenExchangeRatesSource(config.setParametersValues(
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
    OWOX.OpenExchangeRatesFieldsSchema['historical'].uniqueKeys
  );
  storage.cleanUpExpiredData("date");

}

function manageCredentials() {

  const ui = SpreadsheetApp.getUi();
  const Properties = PropertiesService.getDocumentProperties();
  const currentKey = Properties.getProperty('AppId');

  const response = ui.prompt(
    currentKey ? 'Update your App ID' : 'Add your App Id',
    'To import data from Open Exchange Rates, you need to add an App ID. Here’s how you can get it: https://support.openexchangerates.org/article/121-your-app-id',
    ui.ButtonSet.OK_CANCEL
  );

  // Check the user's response
  if (response.getSelectedButton() === ui.Button.OK) {
    const newKey = response.getResponseText(); 

    if( currentKey && newKey === "" ) {
      
      Properties.deleteProperty('AppId');
      ui.alert('☑️ Saved App ID was deleted');

    } else if( !/^[a-f0-9]{32}$/.test(newKey) ) {

      ui.alert('❌ The provided App ID has an incorrect format');

    } else {
      // Save the input to document properties
      Properties.setProperty('AppId', newKey);

    }
    
  } 

}


function scheduleRuns() {

  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Schedule Runs',
    'To schedule runs, you need to add a time trigger. Details: https://github.com/OWOX/owox-data-marts/issues/47',
    ui.ButtonSet.OK_CANCEL
  );

  

}

function checkForTimeout() {
  var config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  config.checkForTimeout();
}
