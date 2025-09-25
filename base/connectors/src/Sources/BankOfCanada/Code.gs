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
  const source = new OWOX.BankOfCanadaSource(config);
  const runConfig = new OWOX.AbstractRunConfig({
    type: importType,
    data: params || []
  });

  const connector = new OWOX.BankOfCanadaConnector(
    config,
    source,
    "GoogleSheetsStorage", // storage name, e.g., "GoogleSheetsStorage", "GoogleBigQueryStorage"
    runConfig
  );

  connector.run();
}

function manualBackfill() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const source = new OWOX.BankOfCanadaSource(config);

  config.showManualBackfillDialog(source);
}

function executeManualBackfill(params) {
  importNewData(OWOX.RUN_CONFIG_TYPE.MANUAL_BACKFILL, params);
}

function cleanUpExpiredData() {

  const storage = new OWOX.GoogleSheetsStorage( 
    new OWOX.GoogleSheetsConfig( CONFIG_RANGE ),
    ["date", "label"] 
  );
  storage.cleanUpExpiredData("date");

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
