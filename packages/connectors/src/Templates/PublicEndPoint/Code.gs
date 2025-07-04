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

  const connector = new OWOX.YOUR_DATA_SOURCEConnector(
    config,                                               // connector configuration
    new OWOX.YOUR_DATA_SOURCESource(config),                 // source 
    new OWOX.GoogleSheetsStorage(config, ["date"]) // storage 
  );

  connector.run();

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
