import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

// ---------------------------------------------------------------------------
// DSET-01, DSET-04: Storage card & Output schema sections.
// Uses a fresh DM per test (beforeEach) for full isolation.
// ---------------------------------------------------------------------------
test.describe('Data Setup - Storage Card & Output Schema', () => {
  let datamartId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id, `DataSetup DM ${Date.now()}`);
    datamartId = dm.id;
  });

  test('renders storage card with assigned storage info (DSET-01)', async ({ page }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // Verify Storage CollapsibleCard section is visible.
    // CardTitle renders as a <div>, not an <h1>-<h6>, so use getByText.
    const dataSetupContent = page.getByTestId(TESTIDS.datamartTabDataSetup);
    await expect(dataSetupContent.getByText('Storage').first()).toBeVisible();

    // The default createStorage() creates a GOOGLE_BIGQUERY storage.
    // DataMartDataStorageView renders a ListItemCard with "Google BigQuery" title.
    await expect(dataSetupContent.getByText('Google BigQuery')).toBeVisible();
  });

  test('renders output schema section (DSET-04)', async ({ page }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // Verify Output Schema CollapsibleCard section is visible.
    // CardTitle renders as a <div>, not a heading role.
    // Use { exact: true } because "Output Schema" also appears in tooltip
    // text and the empty state message "Output schema has no configured fields".
    const dataSetupContent = page.getByTestId(TESTIDS.datamartTabDataSetup);
    await expect(dataSetupContent.getByText('Output Schema', { exact: true })).toBeVisible();

    // For a fresh DM with no definition, the schema section renders without errors.
    // The empty state shows a table with "Output schema has no configured fields".
  });
});

// ---------------------------------------------------------------------------
// DSET-02, DSET-03: SQL definition type selection, Monaco editor interaction,
// save via keyboard input, and persistence after API-set + reload.
// ---------------------------------------------------------------------------
test.describe('Data Setup - SQL Definition', () => {
  let datamartId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id, `SQL DM ${Date.now()}`);
    datamartId = dm.id;
  });

  test('selects SQL type and editor renders (DSET-02)', async ({ page, radix }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // Locate the definition type selector (only shows for DMs with no definition)
    const typeSelector = page.getByLabel('Definition Type');
    await expect(typeSelector).toBeVisible();

    // Select SQL type
    await radix.selectOption(typeSelector, 'SQL');

    // Verify Monaco editor renders
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 });
  });

  test('saves SQL definition via UI and verifies persistence (DSET-03 - keyboard input)', async ({
    page,
    radix,
  }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // Select SQL type
    await radix.selectOption(page.getByLabel('Definition Type'), 'SQL');

    // Wait for Monaco editor to render
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();

    // Click the editor to focus it -- target the input area specifically
    await editor.click();

    // Type SQL using keyboard (fill() does NOT work with Monaco).
    // Monaco needs the editor to be focused first, then keyboard input.
    await page.keyboard.type('SELECT 1 AS test_column');

    // Wait for Monaco to process input and fire onChange, which triggers
    // react-hook-form's field.onChange -> isDirty becomes true.
    // The definition form Save button is INSIDE the Input Source section.
    // There's also a Save button in the Output Schema section -- scope to
    // the form within the Input Source area.
    const inputSourceSection = page.locator('form').first();
    const saveButton = inputSourceSection.getByRole('button', {
      name: 'Save',
    });
    await expect(saveButton).toBeEnabled({ timeout: 10000 });

    // Click Save
    await saveButton.click();

    // Wait for save to complete -- Save button becomes disabled after successful save
    // (isDirty resets to false after form.reset(data))
    await expect(saveButton).toBeDisabled({ timeout: 10000 });

    // Verify via API that the definition was saved
    const apiRes = await page.request.get(`/api/data-marts/${datamartId}`);
    expect(apiRes.ok()).toBeTruthy();
    const dmData = await apiRes.json();
    expect(dmData.definition?.sqlQuery).toContain('SELECT 1');

    // Verify editor still shows the text
    await expect(page.locator('.view-lines')).toContainText('SELECT 1');
  });

  test('shows persisted SQL definition after reload (DSET-03 - API-set + reload)', async ({
    page,
    apiHelpers,
  }) => {
    // Set definition via API first
    await apiHelpers.setDefinition(datamartId, 'SELECT 42 AS answer');

    // Navigate to data-setup tab
    await page.goto(`/ui/0/data-marts/${datamartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // The definition type selector will NOT appear since the DM already has a definition.
    // The SQL form renders directly with Monaco editor showing the SQL text.
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 });

    // Verify the editor shows the SQL text set via API
    await expect(page.locator('.view-lines')).toContainText('SELECT 42');
  });
});

// ---------------------------------------------------------------------------
// DSET-05, DSET-06, DSET-07: Connector definition type selection,
// Bank of Canada wizard completion, and connector persistence after reload.
// ---------------------------------------------------------------------------
test.describe('Data Setup - Connector Definition', () => {
  let datamartId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const storage = await apiHelpers.createStorage();
    // Seed storage config — CONNECTOR definitions require storage.config + credentialId
    apiHelpers.seedStorageConfig(storage.id);
    const dm = await apiHelpers.createDataMart(storage.id, `Connector DM ${Date.now()}`);
    datamartId = dm.id;
  });

  test('selects Connector type and connector wizard auto-opens (DSET-05)', async ({
    page,
    radix,
  }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // Select Connector type
    await radix.selectOption(page.getByLabel('Definition Type'), 'Connector');

    // When Connector type is selected for a new DM, the ConnectorEditForm
    // auto-opens via autoOpen prop (no separate "Setup Connector" click needed).
    // Verify the wizard opens at Step 1 with the connector selection grid.
    await expect(page.getByText('Choose Connector')).toBeVisible({
      timeout: 10000,
    });

    // Verify "Bank of Canada" is available in the connector grid
    await expect(page.getByText('Bank of Canada', { exact: true })).toBeVisible();

    // Verify the step indicator shows "Step 1 of 5"
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
  });

  test('completes Bank of Canada connector wizard and verifies persistence after reload (DSET-06, DSET-07)', async ({
    page,
    radix,
  }) => {
    // Increase test timeout for the multi-step wizard flow
    test.setTimeout(90000);

    await page.goto(`/ui/0/data-marts/${datamartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // Select Connector type -- the wizard auto-opens
    await radix.selectOption(page.getByLabel('Definition Type'), 'Connector');

    // -----------------------------------------------------------------------
    // Step 1 of 5: Select Connector -- choose "Bank of Canada" from the grid
    // -----------------------------------------------------------------------
    await expect(page.getByText('Choose Connector')).toBeVisible({
      timeout: 10000,
    });
    await page.getByText('Bank of Canada', { exact: true }).click();

    // Click Next to go to Step 2
    const nextButton = page.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // -----------------------------------------------------------------------
    // Step 2 of 5: Configuration -- ReimportLookbackWindow has default=2,
    // so the form should already be valid. Just click Next.
    // -----------------------------------------------------------------------
    await expect(page.getByText('Configure Settings')).toBeVisible({
      timeout: 10000,
    });
    // Wait for Next to be enabled (configuration loaded and valid)
    await expect(nextButton).toBeEnabled({ timeout: 10000 });
    await nextButton.click();

    // -----------------------------------------------------------------------
    // Step 3 of 5: Select Nodes -- click "Bank of Canada Exchange Rates"
    // -----------------------------------------------------------------------
    // The node label uses the "overview" field from BankOfCanadaFieldsSchema
    await expect(page.getByText('Bank of Canada Exchange Rates')).toBeVisible({ timeout: 10000 });
    // The node is rendered as AppWizardStepCardItem with type='radio'
    await page.getByText('Bank of Canada Exchange Rates').click();
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // -----------------------------------------------------------------------
    // Step 4 of 5: Select Fields -- unique keys (date, label) are auto-selected.
    // The defaultFields mechanism may pre-select fields automatically.
    // We need at least one field selected for Next to be enabled.
    // -----------------------------------------------------------------------
    // Wait for fields to load -- the "rate" field should be visible
    await expect(page.getByText('rate')).toBeVisible({ timeout: 10000 });

    // Unique keys (date, label) are auto-selected and disabled.
    // If rate is not selected, click it to ensure at least one non-key field is selected.
    const rateCheckbox = page.locator('input[value="rate"]');
    if (!(await rateCheckbox.isChecked())) {
      await rateCheckbox.click({ force: true });
    }

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // -----------------------------------------------------------------------
    // Step 5 of 5: Target Setup -- for GOOGLE_BIGQUERY, needs Dataset name
    // and Table name. Both are pre-filled with defaults from the wizard.
    // -----------------------------------------------------------------------
    await expect(page.getByText('Choose where to store your data')).toBeVisible({ timeout: 10000 });

    // The Dataset name and Table name inputs should be pre-filled with defaults:
    // Dataset name: "bank_of_canada_owox"
    // Table name: "bank_of_canada_exchange_rates"
    // The Save button (finishLabel = 'Save') should be enabled if target is valid.
    const saveButton = page.getByRole('button', { name: 'Save' }).last();
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // Click Save to complete the wizard and auto-save the connector definition
    await saveButton.click();

    // Wait for the wizard sheet to close
    await expect(page.getByText('Choose where to store your data')).not.toBeVisible({
      timeout: 10000,
    });

    // Verify connector info is displayed on the data-setup page.
    // After saving, the Input Source section shows the connector configuration.
    // The ConnectorConfigurationItem renders the connector's internal name "BankOfCanada".
    const dataSetupContent = page.getByTestId(TESTIDS.datamartTabDataSetup);
    await expect(dataSetupContent.getByText('BankOfCanada')).toBeVisible({ timeout: 10000 });

    // -----------------------------------------------------------------------
    // DSET-07: Verify persistence after reload
    // -----------------------------------------------------------------------
    await page.reload();
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // After reload, the connector definition should still be displayed.
    // The definition type selector will NOT appear since definition exists.
    await expect(dataSetupContent.getByText('BankOfCanada')).toBeVisible({ timeout: 10000 });

    // Verify via API that the definition was saved with connector type
    const apiRes = await page.request.get(`/api/data-marts/${datamartId}`);
    expect(apiRes.ok()).toBeTruthy();
    const dmData = await apiRes.json();
    expect(dmData.definitionType).toBe('CONNECTOR');
    expect(dmData.definition?.connector?.source?.name).toBe('BankOfCanada');
  });
});
