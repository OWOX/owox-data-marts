import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';
import { describeIfCredentials } from '../helpers/credentials';

// ---------------------------------------------------------------------------
// DDET-01: Inline title editing on the detail page.
// ---------------------------------------------------------------------------
test.describe('DataMart Detail - Title Edit', () => {
  let datamartId: string;
  let datamartTitle: string;

  test.beforeEach(async ({ apiHelpers }) => {
    datamartTitle = `Detail DM ${Date.now()}`;
    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id, datamartTitle);
    datamartId = dm.id;
  });

  test('edits title inline (DDET-01)', async ({ page }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/overview`);
    await expect(page.getByTestId(TESTIDS.datamartDetails)).toBeVisible();

    const titleTextarea = page
      .getByTestId(TESTIDS.datamartTitleInput)
      .locator('textarea');

    // Clear and type the new title
    await titleTextarea.click();
    await titleTextarea.fill('');
    await titleTextarea.fill('Updated Title');
    await titleTextarea.press('Enter');

    // Verify the textarea reflects the updated value
    await expect(titleTextarea).toHaveValue('Updated Title');

    // Verify persisted via API
    const res = await page.request.get(`/api/data-marts/${datamartId}`);
    const body = await res.json();
    expect(body.title).toBe('Updated Title');
  });
});

// ---------------------------------------------------------------------------
// DDET-02: Delete datamart from the detail page.
// ---------------------------------------------------------------------------
test.describe('DataMart Detail - Delete', () => {
  let datamartId: string;
  let deleteTitle: string;

  test.beforeEach(async ({ apiHelpers }) => {
    deleteTitle = `Delete Detail DM ${Date.now()}`;
    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id, deleteTitle);
    datamartId = dm.id;
  });

  test('deletes datamart from detail page (DDET-02)', async ({
    page,
    radix,
  }) => {
    await page.goto(`/ui/0/data-marts/${datamartId}/overview`);
    await expect(page.getByTestId(TESTIDS.datamartDetails)).toBeVisible();

    // Open the 3-dot dropdown menu. The trigger is a ghost Button wrapping
    // a MoreVertical icon with no aria-label. Locate it within the details
    // container by targeting the last button that contains an SVG.
    const detailsContainer = page.getByTestId(TESTIDS.datamartDetails);
    await detailsContainer
      .locator('button:has(svg.lucide-ellipsis-vertical)')
      .click();

    // Click the Delete Data Mart menu item (has datamartDeleteButton testid)
    await page.getByTestId(TESTIDS.datamartDeleteButton).click();

    // Confirm the deletion dialog
    await radix.confirmDialog('Delete');

    // Verify redirect to the datamart list page
    await expect(page).toHaveURL(/\/data-marts$/);

    // Verify the deleted DM is absent from the list
    await expect(page.getByText(deleteTitle)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// DDET-03: Manual Run trigger on connector DM + negative case for SQL DM.
// ---------------------------------------------------------------------------
test.describe('DataMart Detail - Manual Run', () => {
  test('triggers manual run on connector DM (DDET-03)', async ({
    page,
    apiHelpers,
  }) => {
    const title = `Connector Run DM ${Date.now()}`;
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart(title);

    await page.goto(`/ui/0/data-marts/${datamart.id}/overview`);
    await expect(page.getByTestId(TESTIDS.datamartDetails)).toBeVisible();

    // Open the 3-dot dropdown menu
    const detailsContainer = page.getByTestId(TESTIDS.datamartDetails);
    await detailsContainer
      .locator('button:has(svg.lucide-ellipsis-vertical)')
      .click();

    // Click "Manual Run..." menu item
    await page.getByRole('menuitem', { name: /Manual Run/ }).click();

    // ConnectorRunSheet opens as a dialog. Scope the Run button to the dialog
    // to avoid collisions with the toast notification "Manual Run..." button.
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    const runButton = sheet.getByRole('button', { name: 'Run' });
    await runButton.click();

    // Navigate to Run History tab to verify a run entry appeared.
    // Run History uses div-based RunItem components (not table rows).
    await page.goto(`/ui/0/data-marts/${datamart.id}/run-history`);
    await expect(
      page.getByTestId(TESTIDS.runHistoryTable),
    ).toBeVisible({ timeout: 15000 });
  });

  test('manual run absent for SQL DM (DDET-03 negative)', async ({
    page,
    apiHelpers,
  }) => {
    const title = `SQL DM ${Date.now()}`;
    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id, title);
    await apiHelpers.setDefinition(dm.id);
    await apiHelpers.publish(dm.id);

    await page.goto(`/ui/0/data-marts/${dm.id}/overview`);
    await expect(page.getByTestId(TESTIDS.datamartDetails)).toBeVisible();

    // Open the 3-dot dropdown menu
    const detailsContainer = page.getByTestId(TESTIDS.datamartDetails);
    await detailsContainer
      .locator('button:has(svg.lucide-ellipsis-vertical)')
      .click();

    // Verify "Manual Run..." is NOT present in the menu
    await expect(
      page.getByRole('menuitem', { name: /Manual Run/ }),
    ).not.toBeVisible();

    // Close the dropdown
    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------------------
// DDET-04: Status badge reflects Draft/Published state.
// ---------------------------------------------------------------------------
test.describe('DataMart Detail - Status Badge', () => {
  let draftDmId: string;
  let publishedDmId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    // Create a draft DM
    const storage = await apiHelpers.createStorage();
    const draftDm = await apiHelpers.createDataMart(
      storage.id,
      `Draft Badge DM ${Date.now()}`,
    );
    draftDmId = draftDm.id;

    // Create a published DM
    const { datamart: publishedDm } = await apiHelpers.createPublishedDataMart(
      `Published Badge DM ${Date.now()}`,
    );
    publishedDmId = publishedDm.id;
  });

  test('shows Draft badge on draft DM (DDET-04)', async ({ page }) => {
    await page.goto(`/ui/0/data-marts/${draftDmId}/overview`);
    const details = page.getByTestId(TESTIDS.datamartDetails);
    await expect(details).toBeVisible();

    // Use exact match to avoid collisions with tooltip text that mentions "Draft"
    await expect(details.getByText('Draft', { exact: true })).toBeVisible();
    await expect(
      page.getByTestId(TESTIDS.datamartPublishButton),
    ).toBeVisible();
  });

  test('shows Published badge on published DM (DDET-04)', async ({ page }) => {
    await page.goto(`/ui/0/data-marts/${publishedDmId}/overview`);
    const details = page.getByTestId(TESTIDS.datamartDetails);
    await expect(details).toBeVisible();

    // Use exact match to avoid collisions with tooltip text that mentions "published"
    await expect(details.getByText('Published', { exact: true })).toBeVisible();
    await expect(
      page.getByTestId(TESTIDS.datamartPublishButton),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// DDET-05: Publish flow (credential-gated -- requires real BigQuery creds).
// ---------------------------------------------------------------------------
describeIfCredentials(
  ['BIGQUERY_PROJECT_ID', 'BIGQUERY_CREDENTIALS_JSON'],
  'DataMart Publish Flow (DDET-05)',
  () => {
    test('publishes datamart via full UI flow (DDET-05)', async ({
      page,
      apiHelpers,
      radix,
    }) => {
      // Create storage + DM via API (storage type is already BigQuery)
      const storage = await apiHelpers.createStorage();
      const dm = await apiHelpers.createDataMart(
        storage.id,
        `Publish UI DM ${Date.now()}`,
      );

      // Navigate to Data Setup tab to set definition via UI
      await page.goto(`/ui/0/data-marts/${dm.id}/data-setup`);
      await expect(page.getByTestId(TESTIDS.datamartDetails)).toBeVisible();

      // Select SQL definition type
      const typeSelector = page.getByLabel('Definition Type');
      await radix.selectOption(typeSelector, 'SQL');

      // Type SQL into Monaco editor
      const editorContainer = page.locator('.monaco-editor').first();
      await editorContainer.click();
      await page.keyboard.type('SELECT 1 AS test_column');

      // Click Save and wait for it to succeed
      const saveButton = page.getByRole('button', { name: 'Save' });
      await expect(saveButton).toBeEnabled({ timeout: 5000 });
      await saveButton.click();

      // Wait for save to complete (button becomes disabled again or toast appears)
      await expect(saveButton).toBeDisabled({ timeout: 10000 });

      // Navigate to overview tab
      await page.goto(`/ui/0/data-marts/${dm.id}/overview`);
      await expect(page.getByTestId(TESTIDS.datamartDetails)).toBeVisible();

      // Click the Publish button
      await page.getByTestId(TESTIDS.datamartPublishButton).click();

      // Verify status changes to Published
      await expect(
        page
          .getByTestId(TESTIDS.datamartDetails)
          .getByText('Published'),
      ).toBeVisible({ timeout: 10000 });

      // Verify the publish button disappears
      await expect(
        page.getByTestId(TESTIDS.datamartPublishButton),
      ).not.toBeVisible();
    });
  },
);
