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
    .addItem('🔑 Manage Credentials', 'manageCredentials')
    .addItem('⏰ Schedule', 'scheduleRuns')
    .addItem('📋 Update Fields Sheet', 'updateFieldsSheet')
    .addToUi();
}

function importNewData() {
  const config = new OWOX.GoogleSheetsConfig(CONFIG_RANGE);
  const properties = PropertiesService.getDocumentProperties().getProperties();
    const source = new OWOX.LinkedInPagesSource(config.setParametersValues(properties));

  const connector = new OWOX.LinkedInPagesConnector(
    config, 
    source,
    "GoogleSheetsStorage"
    // "GoogleBigQueryStorage"
  );

  connector.run();
}

function updateFieldsSheet() {
  const config = new OWOX.GoogleSheetsConfig( CONFIG_RANGE );

  config.updateFieldsSheet(
    new OWOX.LinkedInPagesSource( config.setParametersValues( {"AccessToken": "undefined", "Fields": "undefined"} ))
  );
}

function manageCredentials() {
  const ui = SpreadsheetApp.getUi();
  const Properties = PropertiesService.getDocumentProperties();
  const currentKey = Properties.getProperty('AccessToken');
  const response = ui.prompt(
    currentKey ? 'Update your Access Token' : 'Add your Access Token',
    'To import data from LinkedIn Pages API, you need to add an Access Token with r_organizationalentityacls and r_organization_social scopes. Please refer to the documentation for instructions.',
    ui.ButtonSet.OK_CANCEL
  );

  // Check the user's response
  if (response.getSelectedButton() === ui.Button.OK) {
    const newKey = response.getResponseText(); 

    if (currentKey && newKey === "") {
      Properties.deleteProperty('AccessToken');
      ui.alert('☑️ Saved Access Token was deleted');
    } else if (!/^[A-Za-z0-9\-_\.]+$/.test(newKey)) {
      ui.alert('❌ The provided Access Token has an incorrect format');
    } else {
      // Save the input to document properties
      Properties.setProperty('AccessToken', newKey);
      ui.alert('✅ Access Token saved successfully');
    }
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
