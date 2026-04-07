import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

// ---------------------------------------------------------------------------
// AVL-01..03: Storage — Availability section in edit drawer
// ---------------------------------------------------------------------------
test.describe('Storage Availability', () => {
  test('availability section visible in edit mode with two switches (AVL-01)', async ({
    page,
    apiHelpers,
  }) => {
    await apiHelpers.createStorage('GOOGLE_BIGQUERY');
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    // Open edit sheet
    await page.getByRole('button', { name: 'Open menu' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).toBeVisible();

    const sheet = page.getByTestId(TESTIDS.storageConfigSheet);

    // Expand Availability section
    await sheet.getByText('Availability').click();

    // Both switches should be visible
    await expect(sheet.getByText('Available for use')).toBeVisible();
    await expect(sheet.getByText('Available for maintenance')).toBeVisible();
  });

  test('availability not shown in create mode (AVL-02)', async ({ page }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    // Click create button
    await page.getByRole('button', { name: /Create/ }).click();

    // Select type
    const dialog = page.getByTestId(TESTIDS.storageTypeDialog);
    await expect(dialog).toBeVisible();
    await dialog.getByText('Google BigQuery').click();

    // Wait for the sheet to appear
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).toBeVisible();

    // Availability section should NOT be present
    const sheet = page.getByTestId(TESTIDS.storageConfigSheet);
    await expect(sheet.getByText('Availability')).not.toBeVisible();
  });

  test('availability changes persist after save (AVL-03)', async ({ page, apiHelpers }) => {
    const storage = await apiHelpers.createStorage('GOOGLE_BIGQUERY');
    // Set initial availability to both ON
    await apiHelpers.setStorageAvailability(storage.id, true, true);

    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    // Open edit sheet
    await page.getByRole('button', { name: 'Open menu' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const sheet = page.getByTestId(TESTIDS.storageConfigSheet);
    await expect(sheet).toBeVisible();

    // Expand Availability section
    await sheet.getByText('Availability').click();

    // Toggle "Available for maintenance" OFF
    const maintenanceSwitch = sheet
      .getByText('Available for maintenance')
      .locator('..')
      .getByRole('switch');
    await maintenanceSwitch.click();

    // Save button should be enabled — click it
    await sheet.getByRole('button', { name: 'Save' }).click();

    // Wait for success toast
    await expect(page.getByText('Storage updated')).toBeVisible();

    // Re-open the edit sheet
    await page.getByRole('button', { name: 'Open menu' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(sheet).toBeVisible();

    // Expand Availability section again
    await sheet.getByText('Availability').click();

    // "Available for maintenance" should be OFF
    const maintenanceSwitchAfter = sheet
      .getByText('Available for maintenance')
      .locator('..')
      .getByRole('switch');
    await expect(maintenanceSwitchAfter).toHaveAttribute('data-state', 'unchecked');
  });
});

// ---------------------------------------------------------------------------
// AVL-04..05: Destination — Availability section in edit drawer
// ---------------------------------------------------------------------------
test.describe('Destination Availability', () => {
  test('availability section visible in edit mode (AVL-04)', async ({ page, apiHelpers }) => {
    await apiHelpers.createDestination('LOOKER_STUDIO', 'Avail Dest');
    await page.goto('/ui/0/data-destinations');
    await expect(page.getByTestId(TESTIDS.destTab)).toBeVisible();

    // Open edit sheet by clicking title
    await page.getByText('Avail Dest').click();
    const sheet = page.getByTestId(TESTIDS.destEditSheet);
    await expect(sheet).toBeVisible();

    // Expand Availability section
    await sheet.getByText('Availability').click();

    await expect(sheet.getByText('Available for use')).toBeVisible();
    await expect(sheet.getByText('Available for maintenance')).toBeVisible();
  });

  test('destination availability changes persist after save (AVL-05)', async ({
    page,
    apiHelpers,
  }) => {
    const dest = await apiHelpers.createDestination('LOOKER_STUDIO', 'Persist Dest');
    await apiHelpers.setDestinationAvailability(dest.id, true, true);

    await page.goto('/ui/0/data-destinations');
    await expect(page.getByTestId(TESTIDS.destTab)).toBeVisible();

    // Open edit sheet
    await page.getByText('Persist Dest').click();
    const sheet = page.getByTestId(TESTIDS.destEditSheet);
    await expect(sheet).toBeVisible();

    // Expand Availability section
    await sheet.getByText('Availability').click();

    // Toggle "Available for use" OFF
    const useSwitch = sheet.getByText('Available for use').locator('..').getByRole('switch');
    await useSwitch.click();

    // Save
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Destination updated')).toBeVisible();

    // Re-open
    await page.getByText('Persist Dest').click();
    await expect(sheet).toBeVisible();
    await sheet.getByText('Availability').click();

    // "Available for use" should be OFF
    const useSwitchAfter = sheet.getByText('Available for use').locator('..').getByRole('switch');
    await expect(useSwitchAfter).toHaveAttribute('data-state', 'unchecked');
  });
});

// ---------------------------------------------------------------------------
// AVL-06..08: DataMart — Availability on Overview tab
// ---------------------------------------------------------------------------
test.describe('DataMart Availability', () => {
  test('overview tab shows availability card with two switches (AVL-06)', async ({
    page,
    apiHelpers,
  }) => {
    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id);

    await page.goto(`/ui/0/data-marts/${dm.id}/overview`);
    await expect(page.getByTestId(TESTIDS.datamartTabOverview)).toBeVisible();

    await expect(page.getByText('Availability')).toBeVisible();
    await expect(page.getByText('Available for reporting')).toBeVisible();
    await expect(page.getByText('Available for maintenance')).toBeVisible();
  });

  test('DM availability toggle saves immediately without Save button (AVL-07)', async ({
    page,
    apiHelpers,
  }) => {
    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id);
    await apiHelpers.setDataMartAvailability(dm.id, true, true);

    await page.goto(`/ui/0/data-marts/${dm.id}/overview`);
    await expect(page.getByTestId(TESTIDS.datamartTabOverview)).toBeVisible();

    // Toggle "Available for reporting" OFF
    const reportingSwitch = page
      .getByText('Available for reporting')
      .locator('..')
      .getByRole('switch');
    await reportingSwitch.click();

    // Toast should appear immediately (no Save button needed)
    await expect(page.getByText('Availability updated')).toBeVisible();
  });

  test('DM availability persists after page reload (AVL-08)', async ({ page, apiHelpers }) => {
    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id);
    await apiHelpers.setDataMartAvailability(dm.id, true, true);

    await page.goto(`/ui/0/data-marts/${dm.id}/overview`);
    await expect(page.getByTestId(TESTIDS.datamartTabOverview)).toBeVisible();

    // Toggle "Available for maintenance" OFF
    const maintenanceSwitch = page
      .getByText('Available for maintenance')
      .locator('..')
      .getByRole('switch');
    await maintenanceSwitch.click();
    await expect(page.getByText('Availability updated')).toBeVisible();

    // Reload page
    await page.reload();
    await expect(page.getByTestId(TESTIDS.datamartTabOverview)).toBeVisible();

    // "Available for maintenance" should be OFF after reload
    const maintenanceSwitchAfter = page
      .getByText('Available for maintenance')
      .locator('..')
      .getByRole('switch');
    await expect(maintenanceSwitchAfter).toHaveAttribute('data-state', 'unchecked');

    // "Available for reporting" should still be ON
    const reportingSwitchAfter = page
      .getByText('Available for reporting')
      .locator('..')
      .getByRole('switch');
    await expect(reportingSwitchAfter).toHaveAttribute('data-state', 'checked');
  });
});
