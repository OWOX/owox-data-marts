import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

// ---------------------------------------------------------------------------
// Reports - Looker Studio Pattern (Card UI)
// LookerStudioReportCard uses a SwitchItemCard toggle to create/remove reports.
// The @BeforeInsert hook on the backend overrides the report title to empty
// string (Phase 6 decision). AddReportButton is NOT rendered for LOOKER_STUDIO
// destinations -- the toggle IS the creation mechanism.
// ---------------------------------------------------------------------------
test.describe('Reports - Looker Studio Pattern (Card UI)', () => {
  let datamartId: string;
  let destTitle: string;
  let destId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    datamartId = datamart.id;
    destTitle = `LS Dest ${Date.now()}`;
    const dest = await apiHelpers.createDestination('LOOKER_STUDIO', destTitle);
    destId = dest.id;
  });

  test('creates report by toggling Looker Studio card on (RPT-01)', async ({ page }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
    const destTab = page.getByTestId(TESTIDS.destTab);
    await expect(destTab).toBeVisible();

    // Find the specific destination card
    const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible();

    // Before toggle: card shows "Not available in Looker Studio"
    await expect(card.getByText('Not available in Looker Studio')).toBeVisible();

    // Toggle the switch ON to create the report
    const toggle = card.getByRole('switch');
    await expect(toggle).toBeVisible();
    await toggle.click();

    // After toggle: card shows "Available in Looker Studio"
    await expect(card.getByText('Available in Looker Studio')).toBeVisible({ timeout: 10000 });
  });

  test('edits Looker Studio report cache lifetime (RPT-03)', async ({
    page,
    apiHelpers,
    radix,
  }) => {
    // Create report via API
    await apiHelpers.createReport(datamartId, destId);

    await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
    const destTab = page.getByTestId(TESTIDS.destTab);
    await expect(destTab).toBeVisible();

    // Find the destination card
    const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible();

    // Card should show "Available in Looker Studio" (report exists)
    await expect(card.getByText('Available in Looker Studio')).toBeVisible({ timeout: 10000 });

    // Click the card to open edit sheet (LookerStudioReportCard has onClick)
    await card.click();

    // Verify reportEditSheet opens
    const sheet = page.getByTestId(TESTIDS.reportEditSheet);
    await expect(sheet).toBeVisible();

    // Change cache lifetime to a different value than the API default (3600 = 1 hour)
    // Use '4 hours' to avoid substring collision ('2 hours' matches '12 hours')
    const cacheSelect = sheet.getByRole('combobox');
    await radix.selectOption(cacheSelect, '4 hours');

    // Save changes -- LookerStudio form uses 'Save changes' in edit mode
    const saveButton = sheet.getByRole('button', { name: 'Save changes' });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // Verify sheet closes
    await expect(sheet).not.toBeVisible({ timeout: 10000 });
  });

  test('deletes Looker Studio report by toggling card off (RPT-04)', async ({
    page,
    apiHelpers,
  }) => {
    // Create report via API
    await apiHelpers.createReport(datamartId, destId);

    await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
    const destTab = page.getByTestId(TESTIDS.destTab);
    await expect(destTab).toBeVisible();

    const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible();

    // Card should show "Available in Looker Studio" (report exists)
    await expect(card.getByText('Available in Looker Studio')).toBeVisible({ timeout: 10000 });

    // Toggle the switch OFF to delete the report
    const toggle = card.getByRole('switch');
    await expect(toggle).toBeVisible();
    await toggle.click();

    // After toggle: card should revert to "Not available in Looker Studio"
    await expect(card.getByText('Not available in Looker Studio')).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Reports - Email Pattern (Table UI)
// EmailReportsTable renders reports in a table with action cells.
// EmailActionsCell provides Run, Edit (via dropdown), Delete (via dropdown).
// ---------------------------------------------------------------------------
test.describe('Reports - Email Pattern (Table UI)', () => {
  let datamartId: string;
  let destTitle: string;
  let destId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    datamartId = datamart.id;
    destTitle = `Email Dest ${Date.now()}`;
    const dest = await apiHelpers.createDestination('EMAIL', destTitle);
    destId = dest.id;
  });

  test('creates report within Email destination (RPT-01)', async ({ page }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
    const destTab = page.getByTestId(TESTIDS.destTab);
    await expect(destTab).toBeVisible();

    // Find the specific Email destination card
    const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible();

    // Click Add Report button within the card
    await card.getByTestId(TESTIDS.reportCreateButton).click();

    // Email report edit sheet opens (SheetContent without reportEditSheet testid)
    // Wait for the sheet to be visible
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // Fill in report title
    const titleInput = sheet.getByLabel('Title');
    await titleInput.fill(`E2E Email Report ${Date.now()}`);

    // Fill in subject field
    const subjectInput = sheet.getByLabel('Subject');
    await subjectInput.fill('E2E Test Subject');

    // Fill in message template (Monaco editor -- click and type)
    // The Custom tab is selected by default for templateSourceType
    const monacoEditor = sheet.locator('.monaco-editor').first();
    await expect(monacoEditor).toBeVisible({ timeout: 10000 });
    await monacoEditor.click();
    await page.keyboard.type('E2E test message body');

    // Use the dropdown "Create new report" to save without running
    const chevronButton = sheet.getByRole('button', { name: 'More actions' });
    await chevronButton.click();
    await page.getByRole('menuitem', { name: 'Create new report' }).click();

    // Wait for the form to submit and sheet to close
    await expect(sheet).not.toBeVisible({ timeout: 30000 });

    // Verify report appears in the table within the destination card
    // The EmailReportsTable should now have at least one row
    await expect(card.locator('tbody tr').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('edits Email report (RPT-03)', async ({ page, apiHelpers }) => {
    // Create report via direct API with email-config
    const reportTitle = `E2E Email Report ${Date.now()}`;
    const reportRes = await page.request.post('/api/reports', {
      data: {
        title: reportTitle,
        dataMartId: datamartId,
        dataDestinationId: destId,
        destinationConfig: {
          type: 'email-config',
          subject: 'Original Subject',
          messageTemplate: 'Original body',
          reportCondition: 'ALWAYS',
        },
      },
    });
    expect(reportRes.ok()).toBeTruthy();

    await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
    const destTab = page.getByTestId(TESTIDS.destTab);
    await expect(destTab).toBeVisible();

    const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible();

    // Click the report row to open edit sheet
    await card.getByText(reportTitle).click();

    // Edit sheet opens
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // Modify the subject field
    const subjectInput = sheet.getByLabel('Subject');
    await subjectInput.fill('');
    await subjectInput.fill('Updated Subject');

    // Save changes -- primary button in edit mode is "Save changes to report"
    const saveButton = sheet.getByRole('button', {
      name: 'Save changes to report',
    });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // Verify sheet closes
    await expect(sheet).not.toBeVisible({ timeout: 15000 });
  });

  test('deletes Email report with confirmation (RPT-04)', async ({ page, radix }) => {
    // Create report via direct API with email-config
    const reportTitle = `E2E Delete Report ${Date.now()}`;
    const reportRes = await page.request.post('/api/reports', {
      data: {
        title: reportTitle,
        dataMartId: datamartId,
        dataDestinationId: destId,
        destinationConfig: {
          type: 'email-config',
          subject: 'Test Subject',
          messageTemplate: 'Test body',
          reportCondition: 'ALWAYS',
        },
      },
    });
    expect(reportRes.ok()).toBeTruthy();

    await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
    const destTab = page.getByTestId(TESTIDS.destTab);
    await expect(destTab).toBeVisible();

    const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible();

    // Verify the report row is visible
    await expect(card.getByText(reportTitle)).toBeVisible();

    // Hover the report row to reveal action buttons
    const reportRow = card.locator('tr', { hasText: reportTitle });
    await reportRow.hover();

    // Open the actions dropdown (MoreHorizontal button)
    await reportRow.getByRole('button', { name: /Actions for report/ }).click();

    // Click "Delete report" menu item
    await page.getByRole('menuitem', { name: /Delete report/ }).click();

    // Confirm deletion via ConfirmationDialog
    await radix.confirmDialog('Delete');

    // Verify report disappears from the table
    await expect(card.getByText(reportTitle)).not.toBeVisible({
      timeout: 10000,
    });
  });
});

// ---------------------------------------------------------------------------
// RPT-02: Report list renders with correct names and count.
// Uses EMAIL destination where titles are preserved (not overridden like
// LOOKER_STUDIO @BeforeInsert).
// ---------------------------------------------------------------------------
test.describe('Reports - List Rendering', () => {
  test('renders report list with correct names and count (RPT-02)', async ({
    page,
    apiHelpers,
  }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    const datamartId = datamart.id;
    const destTitle = `Email List Dest ${Date.now()}`;
    const dest = await apiHelpers.createDestination('EMAIL', destTitle);

    // Create 2 reports via direct API with email-config
    const reportTitleA = `Report Alpha ${Date.now()}`;
    const reportTitleB = `Report Beta ${Date.now()}`;

    const reportResA = await page.request.post('/api/reports', {
      data: {
        title: reportTitleA,
        dataMartId: datamartId,
        dataDestinationId: dest.id,
        destinationConfig: {
          type: 'email-config',
          subject: 'Subject A',
          messageTemplate: 'Body A',
          reportCondition: 'ALWAYS',
        },
      },
    });
    expect(reportResA.ok()).toBeTruthy();

    const reportResB = await page.request.post('/api/reports', {
      data: {
        title: reportTitleB,
        dataMartId: datamartId,
        dataDestinationId: dest.id,
        destinationConfig: {
          type: 'email-config',
          subject: 'Subject B',
          messageTemplate: 'Body B',
          reportCondition: 'ALWAYS',
        },
      },
    });
    expect(reportResB.ok()).toBeTruthy();

    await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
    const destTab = page.getByTestId(TESTIDS.destTab);
    await expect(destTab).toBeVisible();

    const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible();

    // Verify both report titles are visible in the table
    await expect(card.getByText(reportTitleA)).toBeVisible();
    await expect(card.getByText(reportTitleB)).toBeVisible();

    // Verify the table has at least 2 rows
    const rows = card.locator('tbody tr');
    await expect(rows).toHaveCount(2);
  });
});

// ---------------------------------------------------------------------------
// RPT-05: Fire-and-forget report run with Run History verification.
// Uses EMAIL destination + report because EmailActionsCell has a Run button.
// LOOKER_STUDIO reports don't have an explicit Run action in the UI.
// ---------------------------------------------------------------------------
test.describe('Reports - Fire and Forget Run', () => {
  test('triggers report run and verifies in Run History (RPT-05)', async ({ page, apiHelpers }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    const datamartId = datamart.id;
    const destTitle = `Email Run Dest ${Date.now()}`;
    const dest = await apiHelpers.createDestination('EMAIL', destTitle);

    // Create report via direct API with email-config
    const reportTitle = `Run Report ${Date.now()}`;
    const reportRes = await page.request.post('/api/reports', {
      data: {
        title: reportTitle,
        dataMartId: datamartId,
        dataDestinationId: dest.id,
        destinationConfig: {
          type: 'email-config',
          subject: 'Run Test Subject',
          messageTemplate: 'Run Test Body',
          reportCondition: 'ALWAYS',
        },
      },
    });
    expect(reportRes.ok()).toBeTruthy();

    // Navigate to the reports/destinations tab
    await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
    const destTab = page.getByTestId(TESTIDS.destTab);
    await expect(destTab).toBeVisible();

    const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible();

    // Find the report row and hover to reveal action buttons
    const reportRow = card.locator('tr', { hasText: reportTitle });
    await expect(reportRow).toBeVisible();
    await reportRow.hover();

    // Click the Run button and wait for the API response confirming the run was accepted
    const runResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/run') && resp.status() === 201
    );
    await reportRow.getByRole('button', { name: /Run report/ }).click();
    await runResponsePromise;

    // Navigate to Run History tab
    await page.goto(`/ui/0/data-marts/${datamartId}/run-history`);

    // Verify runHistoryTable is visible (runs exist)
    const runContainer = page.getByTestId(TESTIDS.runHistoryTable);
    await expect(runContainer).toBeVisible({ timeout: 15000 });

    // Verify at least one run entry appeared
    await expect(runContainer.locator('.dm-card-block').first()).toBeVisible({ timeout: 15000 });
  });
});
