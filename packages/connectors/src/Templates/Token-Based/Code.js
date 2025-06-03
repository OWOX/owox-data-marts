// Google Sheets Range with config data. Must me referes to a table with three columns: name, value and comment
var CONFIG_RANGE = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config').getRange("A:C");

function onOpen() {
  SpreadsheetApp.getUi().createMenu('OWOX')
    .addItem('▶ Import New Data', 'importNewData')
    .addItem('🧹 CleanUp Expired Data', 'cleanUpExpiredDate')
    .addItem('🔑 Manage Credentials', 'manageCredentials')
    .addItem('⏰ Schedule', 'scheduleRuns')
    .addToUi();
}


function importNewData() {

  const config = new OWOX.GoogleSheetsConfig( CONFIG_RANGE );

  const pipeline = new OWOX.YOUR_DATA_SOURCEPipeline(
    config,                                               // pipeline configuration
    new OWOX.YOUR_DATA_SOURCEConnector(config.setParametersValues(       // connector with parameter's values added from properties 
      PropertiesService.getDocumentProperties().getProperties()
    )), 
    new OWOX.GoogleSheetsStorage(config, ["date"]) // storage 
  );

  pipeline.run();

}


function manageCredentials() {

  const ui = SpreadsheetApp.getUi();
  const Properties = PropertiesService.getDocumentProperties();
  const currentKey = Properties.getProperty('AccessToken');

  const response = ui.prompt(
    currentKey ? 'Update your Access Token' : 'Add your Access Token',
    'To import data from YOUR_DATA_SOURCE, you need to add an Access Token. Here’s how you can get it: DOCUMENTATION PAGE LINK',
    ui.ButtonSet.OK_CANCEL
  );

  // Check the user's response
  if (response.getSelectedButton() === ui.Button.OK) {
    const newKey = response.getResponseText(); 

    if( currentKey && newKey === "" ) {
      
      Properties.deleteProperty('AccessToken');
      ui.alert('☑️ Saved Access Token was deleted');

    } else if( !/^[A-Za-z0-9_]{10,250}$/.test(newKey) ) {

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