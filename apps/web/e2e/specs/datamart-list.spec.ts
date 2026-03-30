import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';
import { ApiHelpers } from '../fixtures/api-helpers';

// ---------------------------------------------------------------------------
// DLIST-04: Empty state must be tested first -- no datamarts in DB yet.
// Deletes all existing datamarts via API at the start of the test itself.
// ---------------------------------------------------------------------------
test.describe('DataMart List - Empty State', () => {
  test('shows empty state when no datamarts exist', async ({ page }) => {
    // Cleanup may take a while if many DMs accumulated from prior test runs.
    test.setTimeout(60_000);

    // Clean up any existing datamarts via API so the list is truly empty.
    const listRes = await page.request.get('/api/data-marts');
    if (listRes.ok()) {
      const body = (await listRes.json()) as { items?: { id: string }[] };
      const items = body.items ?? [];
      for (const item of items) {
        await page.request.delete(`/api/data-marts/${item.id}`);
      }
    }

    await page.goto('/ui/0/data-marts');

    // EmptyDataMartsState renders heading "Let's Build Your First Data Mart" when data is empty.
    // The heading uses non-breaking spaces (&nbsp;). Match via role to avoid text-matching pitfalls.
    // Use heading role to target the specific EmptyStateCardTitle element.
    // Allow generous timeout: first navigation triggers auth redirect -> sign-in -> data fetch -> render.
    await expect(page.getByRole('heading', { name: /Build Your First/ })).toBeVisible({
      timeout: 25000,
    });
  });
});

// ---------------------------------------------------------------------------
// DLIST-01, DLIST-02, DLIST-03, DLIST-05: List operations with pre-seeded data.
// ---------------------------------------------------------------------------
test.describe('DataMart List with data', () => {
  let draftTitle: string;
  let publishedTitle: string;
  let draftDatamartId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    const api = new ApiHelpers(page);

    // Create a DRAFT datamart
    draftTitle = `Draft DM ${Date.now()}`;
    const storage = await api.createStorage();
    const dm = await api.createDataMart(storage.id, draftTitle);
    draftDatamartId = dm.id;

    // Create a PUBLISHED datamart
    publishedTitle = `Published DM ${Date.now()}`;
    await api.createPublishedDataMart(publishedTitle);

    await page.close();
  });

  test('table renders with created datamarts (DLIST-01)', async ({ page }) => {
    await page.goto('/ui/0/data-marts');
    await expect(page.getByTestId(TESTIDS.datamartTable)).toBeVisible();
    // Both datamarts should appear in the table
    await expect(page.getByText(draftTitle)).toBeVisible();
    await expect(page.getByText(publishedTitle)).toBeVisible();
  });

  test('search filters datamarts by title (DLIST-02)', async ({ page }) => {
    await page.goto('/ui/0/data-marts');
    await expect(page.getByTestId(TESTIDS.datamartTable)).toBeVisible();

    // Type the unique part of draftTitle into the search input
    const searchInput = page.getByTestId(TESTIDS.datamartSearchInput).getByPlaceholder('Search');
    await searchInput.fill(draftTitle);

    // Only the draft datamart should be visible
    await expect(page.getByText(draftTitle)).toBeVisible();
    await expect(page.getByText(publishedTitle)).not.toBeVisible();

    // Clear search -- both should reappear
    await searchInput.clear();
    await expect(page.getByText(draftTitle)).toBeVisible();
    await expect(page.getByText(publishedTitle)).toBeVisible();
  });

  test('filter by status shows matching datamarts (DLIST-03)', async ({ page }) => {
    await page.goto('/ui/0/data-marts');
    await expect(page.getByTestId(TESTIDS.datamartTable)).toBeVisible();

    // Open the filters popover by clicking the Filters trigger button
    const filterContainer = page.getByTestId(TESTIDS.datamartStatusFilter);
    await filterContainer.getByRole('button', { name: 'Filters' }).click();

    // The popover should be visible -- it shows the FiltersForm
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover).toBeVisible();

    // Step 1: Select "Status" in the field selector (first Select in the filter row)
    // The default empty row has a "Select field" placeholder
    await popover.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Status' }).click();

    // Step 2: Operator auto-selects "is" (eq). No action needed.

    // Step 3: Select "Draft" value in the Combobox value control.
    // The value control is a chips-based multi-select Combobox.
    // Click the chips area to open the dropdown, then select "Draft".
    await popover.locator('[data-slot="combobox-chips"]').click();
    await page.getByRole('option', { name: 'Draft' }).click();

    // Step 4: Close the combobox dropdown and click "Apply filters".
    // The multi-select combobox stays open after selection. Tab moves focus
    // to the next focusable element inside the popover, closing the dropdown.
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Apply filters' }).click();

    // After applying, only draft datamart should be visible
    await expect(page.getByText(draftTitle)).toBeVisible();
    await expect(page.getByText(publishedTitle)).not.toBeVisible();
  });

  test('click row navigates to datamart detail (DLIST-05)', async ({ page }) => {
    await page.goto('/ui/0/data-marts');
    await expect(page.getByTestId(TESTIDS.datamartTable)).toBeVisible();

    // Click the title text of the draft datamart row to trigger navigation.
    // Avoid checkboxes, actions cells, and menu items -- clicking the title is safe.
    await page.getByText(draftTitle).click();

    // Should navigate to the detail page (data-setup tab)
    await expect(page).toHaveURL(new RegExp(`/data-marts/${draftDatamartId}/data-setup`));
  });
});

// ---------------------------------------------------------------------------
// DLIST-06: Delete -- isolated describe with own beforeAll to avoid breaking
// other tests' data.
// ---------------------------------------------------------------------------
test.describe('DataMart List - Delete', () => {
  let deleteTitle: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    const api = new ApiHelpers(page);
    deleteTitle = `Delete DM ${Date.now()}`;
    const storage = await api.createStorage();
    await api.createDataMart(storage.id, deleteTitle);
    await page.close();
  });

  test('delete datamart via row menu with confirmation (DLIST-06)', async ({ page, radix }) => {
    await page.goto('/ui/0/data-marts');
    await expect(page.getByTestId(TESTIDS.datamartTable)).toBeVisible();

    // Verify the datamart to delete is visible
    await expect(page.getByText(deleteTitle)).toBeVisible();

    // Find the row containing the delete title and open its 3-dot menu.
    // The menu trigger has opacity-0 by default; force: true ensures the click.
    const row = page.locator('tr', { hasText: deleteTitle });
    await row.getByRole('button', { name: 'Open menu' }).click({ force: true });

    // Click the Delete menu item
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    // Confirm the deletion via ConfirmationDialog
    await radix.confirmDialog('Delete');

    // Verify the datamart is no longer visible in the table
    await expect(page.getByText(deleteTitle)).not.toBeVisible();
  });
});
