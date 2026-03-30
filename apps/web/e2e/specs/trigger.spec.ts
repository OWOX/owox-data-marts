import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

// ---------------------------------------------------------------------------
// TRIG-01: Empty state renders on Triggers tab when no triggers exist.
// ---------------------------------------------------------------------------
test.describe('Triggers - Empty State', () => {
  test('shows empty state when no triggers exist (TRIG-01)', async ({ page, apiHelpers }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    await page.goto(`/ui/0/data-marts/${datamart.id}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // ScheduledTriggerTable renders empty state with triggerEmptyState testid
    await expect(page.getByTestId(TESTIDS.triggerEmptyState)).toBeVisible();
    await expect(page.getByText('No scheduled triggers yet')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// TRIG-02 / TRIG-03: CONNECTOR_RUN trigger creation and list rendering.
// ---------------------------------------------------------------------------
test.describe('Triggers - CONNECTOR_RUN Type', () => {
  let datamartId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    datamartId = datamart.id;
  });

  test('creates CONNECTOR_RUN trigger via UI (TRIG-02)', async ({ page, radix }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // Click "Add Trigger" button
    await page.getByTestId(TESTIDS.triggerCreateButton).click();

    // Verify edit sheet is visible
    const sheet = page.getByTestId(TESTIDS.triggerEditSheet);
    await expect(sheet).toBeVisible();

    // Select trigger type: Connector Run (first combobox in the form is Trigger Type)
    await radix.selectOption(sheet.getByRole('combobox').first(), 'Connector Run');

    // Schedule is pre-configured with defaults (daily at 09:00)
    // Create trigger button should be enabled after type selection (form is dirty)
    const createButton = sheet.getByRole('button', { name: 'Create trigger' });
    await expect(createButton).toBeEnabled({ timeout: 5000 });
    await createButton.click();

    // Verify sheet closes
    await expect(sheet).not.toBeVisible({ timeout: 10000 });

    // Verify trigger appears in the table
    const table = page.getByTestId(TESTIDS.triggerTable);
    await expect(table).toBeVisible();
    await expect(table.getByText('Connector Run')).toBeVisible();
  });

  test('shows trigger in list with schedule info (TRIG-03)', async ({ page, apiHelpers }) => {
    // Create trigger via API
    await apiHelpers.createTrigger(datamartId);

    await page.goto(`/ui/0/data-marts/${datamartId}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // Verify trigger table has a row with type badge and schedule info
    const table = page.getByTestId(TESTIDS.triggerTable);
    await expect(table).toBeVisible();
    await expect(table.getByText('Connector Run')).toBeVisible();
    // The cron '0 * * * *' is an interval pattern -- verify schedule column is rendered
    await expect(table.locator('tbody tr').first()).toBeVisible();
  });

  test('edits trigger schedule (TRIG-04)', async ({ page, apiHelpers, radix }) => {
    // Create trigger via API
    await apiHelpers.createTrigger(datamartId);

    await page.goto(`/ui/0/data-marts/${datamartId}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // Click the trigger row to open edit sheet
    const table = page.getByTestId(TESTIDS.triggerTable);
    await expect(table).toBeVisible();
    await table.locator('tbody tr').first().click();

    // Verify edit sheet opens
    const sheet = page.getByTestId(TESTIDS.triggerEditSheet);
    await expect(sheet).toBeVisible();

    // The ScheduleConfig component is inside the sheet with its own "Type" select.
    // The Trigger Type combobox is disabled in edit mode (initialData is set).
    // The ScheduleConfig Type select is the second combobox (after the disabled one).
    // Change schedule type from "Interval" (hour-based for '0 * * * *') to "Weekly".
    const scheduleTypeSelect = sheet.getByRole('combobox').nth(1);
    await radix.selectOption(scheduleTypeSelect, 'Weekly');

    // Save changes
    const saveButton = sheet.getByRole('button', { name: 'Save changes' });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // Verify sheet closes
    await expect(sheet).not.toBeVisible({ timeout: 10000 });
  });

  test('deletes trigger with confirmation (TRIG-05)', async ({ page, apiHelpers, radix }) => {
    // Create trigger via API
    await apiHelpers.createTrigger(datamartId);

    await page.goto(`/ui/0/data-marts/${datamartId}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // Open the trigger row action menu (3-dot button)
    const table = page.getByTestId(TESTIDS.triggerTable);
    await expect(table).toBeVisible();

    // The ScheduledTriggerActionsCell has an "Open menu" aria-label button
    // Hover the row first to make the action button visible
    const row = table.locator('tbody tr').first();
    await row.hover();
    await row.getByRole('button', { name: 'Open menu' }).click();

    // Click "Delete trigger" menu item
    await page.getByRole('menuitem', { name: /Delete trigger/ }).click();

    // Confirm via dialog
    await radix.confirmDialog('Delete');

    // Verify trigger disappears -- empty state should appear
    await expect(page.getByTestId(TESTIDS.triggerEmptyState)).toBeVisible({
      timeout: 10000,
    });
  });
});

// ---------------------------------------------------------------------------
// TRIG-02 (REPORT_RUN variant): Create REPORT_RUN trigger with report selection.
// The ReportSelector only shows reports linked to EMAIL, GOOGLE_SHEETS,
// SLACK, MS_TEAMS, or GOOGLE_CHAT destinations (not LOOKER_STUDIO).
// We create an EMAIL destination + report via direct API to ensure visibility.
// Enterprise edition only — EMAIL destination requires LICENSE_KEY.
// ---------------------------------------------------------------------------
test.describe('Triggers - REPORT_RUN Type', () => {
  test.skip(
    !process.env.LICENSE_KEY,
    'Skipping: EMAIL destination requires LICENSE_KEY (Enterprise edition)'
  );
  let datamartId: string;

  test.beforeEach(async ({ page, apiHelpers }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    datamartId = datamart.id;

    // Create EMAIL destination via API (CLOUD_ONLY in UI but API allows it)
    const dest = await apiHelpers.createDestination('EMAIL', `E2E Email Dest ${Date.now()}`);

    // Create report linked to EMAIL destination with valid email-config
    // (createReport uses looker-studio-config by default, so we call API directly)
    const reportRes = await page.request.post('/api/reports', {
      data: {
        title: `E2E Email Report ${Date.now()}`,
        dataMartId: datamartId,
        dataDestinationId: dest.id,
        destinationConfig: {
          type: 'email-config',
          subject: 'E2E Test Report',
          messageTemplate: 'Test report body',
          reportCondition: 'ALWAYS',
        },
      },
    });
    expect(reportRes.ok()).toBeTruthy();
  });

  test('creates REPORT_RUN trigger with report selection (TRIG-02)', async ({ page, radix }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // Click "Add Trigger" button
    await page.getByTestId(TESTIDS.triggerCreateButton).click();

    // Verify edit sheet is visible
    const sheet = page.getByTestId(TESTIDS.triggerEditSheet);
    await expect(sheet).toBeVisible();

    // Select trigger type: Report Run (first combobox is Trigger Type)
    await radix.selectOption(sheet.getByRole('combobox').first(), 'Report Run');

    // Report selector should now be visible as the second combobox
    // Wait for report list to load, then select the report
    const reportSelect = sheet.getByRole('combobox').nth(1);
    await expect(reportSelect).toBeVisible({ timeout: 5000 });
    await radix.selectOption(reportSelect, /E2E Email Report/);

    // Create trigger button should be enabled
    const createButton = sheet.getByRole('button', { name: 'Create trigger' });
    await expect(createButton).toBeEnabled({ timeout: 5000 });
    await createButton.click();

    // Verify sheet closes
    await expect(sheet).not.toBeVisible({ timeout: 10000 });

    // Verify trigger appears in the table
    const table = page.getByTestId(TESTIDS.triggerTable);
    await expect(table).toBeVisible();
    await expect(table.getByText('Report Run')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// TRIG-06: Toggle trigger enabled/disabled with persistence verification.
// ---------------------------------------------------------------------------
test.describe('Triggers - Toggle Enabled/Disabled', () => {
  test('toggles trigger enabled/disabled with persistence (TRIG-06)', async ({
    page,
    apiHelpers,
  }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    const datamartId = datamart.id;

    // Create trigger via API (starts enabled by default)
    await apiHelpers.createTrigger(datamartId);

    await page.goto(`/ui/0/data-marts/${datamartId}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // Verify trigger row shows "Enabled" status text
    const table = page.getByTestId(TESTIDS.triggerTable);
    await expect(table).toBeVisible();
    await expect(table.getByText('Enabled', { exact: true })).toBeVisible();

    // Click the trigger row to open edit sheet
    await table.locator('tbody tr').first().click();

    const sheet = page.getByTestId(TESTIDS.triggerEditSheet);
    await expect(sheet).toBeVisible();

    // Inside the sheet, find Switch with id='schedule-enabled'
    const toggleSwitch = sheet.locator('#schedule-enabled');
    await expect(toggleSwitch).toBeVisible();

    // Verify it's currently checked (enabled)
    await expect(toggleSwitch).toHaveAttribute('aria-checked', 'true');

    // Toggle the Switch (click it)
    await toggleSwitch.click();

    // Verify aria-checked changes to false
    await expect(toggleSwitch).toHaveAttribute('aria-checked', 'false');

    // Save changes
    const saveButton = sheet.getByRole('button', { name: 'Save changes' });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // Verify sheet closes
    await expect(sheet).not.toBeVisible({ timeout: 10000 });

    // Verify trigger row now shows "Disabled" status
    await expect(table.getByText('Disabled', { exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Reload page for persistence verification
    await page.reload();

    // Navigate to triggers tab again
    await page.goto(`/ui/0/data-marts/${datamartId}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // Verify trigger still shows "Disabled" (persistence verification)
    const tableAfterReload = page.getByTestId(TESTIDS.triggerTable);
    await expect(tableAfterReload).toBeVisible();
    await expect(tableAfterReload.getByText('Disabled', { exact: true })).toBeVisible({
      timeout: 5000,
    });
  });
});

// ---------------------------------------------------------------------------
// TRIG-02 (negative): Validation -- Create trigger button disabled without
// required fields. The ScheduleConfig UI uses preset schedule types (Daily/
// Weekly/Monthly/Interval) which always generate valid cron expressions.
// Custom cron input is disabled in UI. We verify the REPORT_RUN type
// validation instead: the Create button remains disabled without a report.
// ---------------------------------------------------------------------------
test.describe('Triggers - Validation', () => {
  test('shows validation error when required fields missing (TRIG-02 negative)', async ({
    page,
    apiHelpers,
    radix,
  }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();

    await page.goto(`/ui/0/data-marts/${datamart.id}/triggers`);
    await expect(page.getByTestId(TESTIDS.triggerTab)).toBeVisible();

    // Click "Add Trigger" button
    await page.getByTestId(TESTIDS.triggerCreateButton).click();

    const sheet = page.getByTestId(TESTIDS.triggerEditSheet);
    await expect(sheet).toBeVisible();

    // Select trigger type: Report Run (requires report selection)
    await radix.selectOption(sheet.getByRole('combobox').first(), 'Report Run');

    // The Create trigger button is enabled (form is dirty after type selection)
    // but submitting without a report should show validation error
    const createButton = sheet.getByRole('button', { name: 'Create trigger' });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // Verify the form shows a validation error for missing report
    // FormMessage renders with data-slot="form-message" (Phase 9 pattern)
    await expect(sheet.locator('[data-slot="form-message"]')).toBeVisible({ timeout: 5000 });

    // Cancel to dismiss
    const cancelButton = sheet.getByRole('button', { name: 'Cancel' });
    await cancelButton.click();

    // Handle unsaved changes dialog if it appears (form is dirty after type selection)
    const unsavedDialog = page.locator('[data-slot="dialog-content"]');
    if (await unsavedDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
      await unsavedDialog.getByRole('button', { name: /Yes, leave now/ }).click();
    }

    await expect(sheet).not.toBeVisible({ timeout: 5000 });
  });
});
