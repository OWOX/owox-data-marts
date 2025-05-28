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
    .addItem('🧹 CleanUp Expired Data', 'cleanUpExpiredData')
    .addItem('🔑 Manage Credentials', 'manageCredentials')
    .addItem('⏰ Schedule', 'scheduleRuns')
    .addItem('📋 Update Fields Sheet', 'updateFieldsSheet')
    .addToUi();
}

function importNewData() {

  const config = new OWOX.GoogleSheetsConfig( CONFIG_RANGE );
  
  const pipeline = new OWOX.FacebookMarketingPipeline(
    config,                                                           // pipeline configuration
    new OWOX.FacebookMarketingConnector( config.setParametersValues(  // connector with parameter's values added from properties 
      PropertiesService.getDocumentProperties().getProperties()
    ) ),
   // "GoogleBigQueryStorage"
  );

  pipeline.run();

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
    new OWOX.FacebookMarketingConnector( config.setParametersValues( {"AccessToken": "undefined", "Fields": "undefined"} ))
  );

}

function manageCredentials() {

  const ui = SpreadsheetApp.getUi();
  const Properties = PropertiesService.getDocumentProperties();
  const currentKey = Properties.getProperty('AccessToken');
  const response = ui.prompt(
    currentKey ? 'Update your Access Token' : 'Add your Access Token',
    'To import data from Facebook Marketing API, you need to add an Access Token. Here’s how you can get it: https://github.com/OWOX/js-data-connectors/tree/main/src/Integrations/FacebookMarketing',
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