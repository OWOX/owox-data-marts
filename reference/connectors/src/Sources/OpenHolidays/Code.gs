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

function importNewData(importType = OpenHolidays_Integration.RUN_CONFIG_TYPE.INCREMENTAL, params = null) {
    const config = new OpenHolidays_Integration.GoogleSheetsConfig(CONFIG_RANGE);
  const source = new OpenHolidays_Integration.OpenHolidaysSource(config);
  const runConfig = new OpenHolidays_Integration.AbstractRunConfig({
    type: importType,
    data: params || []
  });

  const connector = new OpenHolidays_Integration.OpenHolidaysConnector(
        config,
    source,
    "GoogleSheetsStorage",
    runConfig
    );

  connector.run();
}

function manualBackfill() {
  const config = new OpenHolidays_Integration.GoogleSheetsConfig(CONFIG_RANGE);
  const source = new OpenHolidays_Integration.OpenHolidaysSource(config);

  config.showManualBackfillDialog(source);
}

function executeManualBackfill(params) {
  importNewData(OpenHolidays_Integration.RUN_CONFIG_TYPE.MANUAL_BACKFILL, params);
}

function cleanUpExpiredData() {

  const storage = new OpenHolidays_Integration.GoogleSheetsStorage( 
    new OpenHolidays_Integration.GoogleSheetsConfig( CONFIG_RANGE ),
    ["id"] 
  );
  storage.cleanUpExpiredData("id");

}

function test(){
  const config = new OpenHolidays_Integration.GoogleSheetsConfig(CONFIG_RANGE);
  console.log("DestinationSpreadsheet value:", config.DestinationSpreadsheet?.value);
}

function checkForTimeout() {
  var config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  config.checkForTimeout();
}
