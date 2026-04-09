import { test, expect, type Locator } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

/** Ensure a collapsible FormSection is expanded (handles localStorage state). */
async function ensureSectionExpanded(container: Locator, sectionName: string): Promise<void> {
  const trigger = container.getByRole('button', { name: sectionName });
  await trigger.scrollIntoViewIfNeeded();
  const state = await trigger.getAttribute('data-state');
  if (state !== 'open') {
    await trigger.click();
  }
}

/**
 * Get the two availability switches within a container.
 * Returns [primarySwitch, maintenanceSwitch] — the first switch is
 * "Available for use" (storage/destination) or "Available for reporting" (data-mart),
 * the second is always "Available for maintenance".
 */
function getAvailabilitySwitches(container: Locator): [Locator, Locator] {
  const switches = container.getByRole('switch');
  return [switches.first(), switches.nth(1)];
}

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
    await ensureSectionExpanded(sheet, 'Availability');

    // Both labels should be visible
    await expect(sheet.getByText('Available for use', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Available for maintenance', { exact: true })).toBeVisible();
  });

  test('availability defaults to both OFF for new storage (AVL-02)', async ({
    page,
    apiHelpers,
  }) => {
    await apiHelpers.createStorage('GOOGLE_BIGQUERY');
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    // Open edit sheet
    await page.getByRole('button', { name: 'Open menu' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const sheet = page.getByTestId(TESTIDS.storageConfigSheet);
    await expect(sheet).toBeVisible();

    // Expand Availability section
    await ensureSectionExpanded(sheet, 'Availability');

    // New storages default to OFF (not shared until owner explicitly enables)
    const [useSwitch, maintenanceSwitch] = getAvailabilitySwitches(sheet);
    await expect(useSwitch).toHaveAttribute('data-state', 'unchecked');
    await expect(maintenanceSwitch).toHaveAttribute('data-state', 'unchecked');
  });

  test('availability set via API is reflected in UI (AVL-03)', async ({ page, apiHelpers }) => {
    const storage = await apiHelpers.createStorage('GOOGLE_BIGQUERY');
    // Set "Available for maintenance" to OFF via API
    await apiHelpers.setStorageAvailability(storage.id, true, false);

    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    // Open edit sheet
    await page.getByRole('button', { name: 'Open menu' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const sheet = page.getByTestId(TESTIDS.storageConfigSheet);
    await expect(sheet).toBeVisible();

    // Expand Availability section
    await ensureSectionExpanded(sheet, 'Availability');

    // "Available for use" should be ON, "Available for maintenance" should be OFF
    const [useSwitch, maintenanceSwitch] = getAvailabilitySwitches(sheet);
    await expect(useSwitch).toHaveAttribute('data-state', 'checked');
    await expect(maintenanceSwitch).toHaveAttribute('data-state', 'unchecked');
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
    await ensureSectionExpanded(sheet, 'Availability');

    await expect(sheet.getByText('Available for use', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Available for maintenance', { exact: true })).toBeVisible();
  });

  test('destination availability set via API is reflected in UI (AVL-05)', async ({
    page,
    apiHelpers,
  }) => {
    const dest = await apiHelpers.createDestination('LOOKER_STUDIO', 'Persist Dest');
    // Set "Available for use" to OFF via API
    await apiHelpers.setDestinationAvailability(dest.id, false, true);

    await page.goto('/ui/0/data-destinations');
    await expect(page.getByTestId(TESTIDS.destTab)).toBeVisible();

    // Open edit sheet
    await page.getByText('Persist Dest').click();
    const sheet = page.getByTestId(TESTIDS.destEditSheet);
    await expect(sheet).toBeVisible();

    // Expand Availability section
    await ensureSectionExpanded(sheet, 'Availability');

    // "Available for use" should be OFF, "Available for maintenance" should be ON
    const [useSwitch, maintenanceSwitch] = getAvailabilitySwitches(sheet);
    await expect(useSwitch).toHaveAttribute('data-state', 'unchecked');
    await expect(maintenanceSwitch).toHaveAttribute('data-state', 'checked');
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
    await expect(page.getByText('Available for reporting', { exact: true })).toBeVisible();
    await expect(page.getByText('Available for maintenance', { exact: true })).toBeVisible();
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

    // Toggle "Available for reporting" OFF (first switch)
    const [reportingSwitch] = getAvailabilitySwitches(page);
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

    // Toggle "Available for maintenance" OFF (second switch)
    const [, maintenanceSwitch] = getAvailabilitySwitches(page);
    await maintenanceSwitch.click();
    await expect(page.getByText('Availability updated')).toBeVisible();

    // Reload page
    await page.reload();
    await expect(page.getByTestId(TESTIDS.datamartTabOverview)).toBeVisible();

    // "Available for maintenance" should be OFF after reload
    const [reportingSwitchAfter, maintenanceSwitchAfter] = getAvailabilitySwitches(page);
    await expect(maintenanceSwitchAfter).toHaveAttribute('data-state', 'unchecked');

    // "Available for reporting" should still be ON
    await expect(reportingSwitchAfter).toHaveAttribute('data-state', 'checked');
  });
});
