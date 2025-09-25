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
    .addItem('🧹 CleanUp Expired Data', 'cleanUpExpiredDate')
    .addItem('🔑 Manage Credentials', 'manageCredentials')
    .addItem('⏰ Schedule', 'scheduleRuns')
    .addToUi();
}

function importNewData(importType = OWOX.RUN_CONFIG_TYPE.INCREMENTAL, params = null) {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const properties = PropertiesService.getDocumentProperties().getProperties();
  const source = new OWOX.GitHubSource(config.setParametersValues(properties));
  const runConfig = new OWOX.AbstractRunConfig({
    type: importType,
    data: params || []
  });

  const connector = new OWOX.GitHubConnector(
    config,
    source,
    new OWOX.GoogleSheetsStorage(config, ["date"]),
    runConfig
  );

  connector.run();
}

function manualBackfill() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const source = new OWOX.GitHubSource(config.setParametersValues(
    PropertiesService.getDocumentProperties().getProperties()
  ));
  
  config.showManualBackfillDialog(source);
}

function executeManualBackfill(params) {
  importNewData(OWOX.RUN_CONFIG_TYPE.MANUAL_BACKFILL, params);
}

function manageCredentials() {

  const ui = SpreadsheetApp.getUi();
  const Properties = PropertiesService.getDocumentProperties();
  const currentKey = Properties.getProperty('AccessToken');

  const response = ui.prompt(
    currentKey ? 'Update your Access Token' : 'Add your Access Token',
    'To import data from GitHub, you need to add an Access Token. Here’s how you can get it: https://github.com/settings/personal-access-tokens',
    ui.ButtonSet.OK_CANCEL
  );

  // Check the user's response
  if (response.getSelectedButton() === ui.Button.OK) {
    const newKey = response.getResponseText(); 

    if( currentKey && newKey === "" ) {
      
      Properties.deleteProperty('AccessToken');
      ui.alert('☑️ Saved Access Token was deleted');

    } else if( !/^github_pat_[A-Za-z0-9_]{70,250}$/.test(newKey) ) {

      ui.alert('❌ The provided Access Token has an incorrect format');

    } else {
      // Save the input to document properties
      Properties.setProperty('AccessToken', newKey);

    }
    
  } 

}


function cleanUpExpiredData() {

  const storage = new OWOX.GoogleSheetsStorage( 
    new OWOX.GoogleSheetsConfig( CONFIG_RANGE ),
    ["date"] 
  );
  storage.cleanUpExpiredData("date");

}

function checkForTimeout() {
  var config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  config.checkForTimeout();
}
