import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';
import { describeIfCredentials } from '../helpers/credentials';

// ---------------------------------------------------------------------------
// DEST-01: Empty state renders on DM Destinations tab for a fresh datamart.
// Deletes all existing destinations via API first (Phase 9 cleanup pattern).
// ---------------------------------------------------------------------------
test.describe('Destinations - Empty State', () => {
  test('shows empty state on fresh DM (DEST-01)', async ({ page, apiHelpers }) => {
    // Clean up ALL existing reports first (destinations with reports
    // cannot be deleted -- backend throws BusinessViolationException).
    const reportsRes = await page.request.get('/api/reports');
    if (reportsRes.ok()) {
      const reports = (await reportsRes.json()) as { id: string }[];
      for (const report of reports) {
        await page.request.delete(`/api/reports/${report.id}`);
      }
    }

    // Now clean up ALL existing destinations so the DM tab shows empty state.
    // The GET /api/data-destinations endpoint returns a plain array.
    const listRes = await page.request.get('/api/data-destinations');
    if (listRes.ok()) {
      const destinations = (await listRes.json()) as { id: string }[];
      for (const dest of destinations) {
        await page.request.delete(`/api/data-destinations/${dest.id}`);
      }
    }

    const storage = await apiHelpers.createStorage();
    const dm = await apiHelpers.createDataMart(storage.id);

    // The Destinations tab route is /reports (legacy naming)
    await page.goto(`/ui/0/data-marts/${dm.id}/reports`);

    // EmptyDataMartDestinationsState renders "Go to Destinations" link
    // (does NOT use destEmptyState testid -- that is on standalone page)
    await expect(page.getByText('Go to Destinations')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// DEST-02..06: Destination CRUD per type (parameterized)
// Enterprise-only types (EMAIL, MS_TEAMS, GOOGLE_CHAT) require LICENSE_KEY.
// ---------------------------------------------------------------------------
const COMMUNITY_DESTINATION_TYPES = [
  { type: 'LOOKER_STUDIO', label: 'Looker Studio', prefix: 'LS' },
] as const;

const ENTERPRISE_DESTINATION_TYPES = [
  { type: 'EMAIL', label: 'Email', prefix: 'Email' },
  { type: 'MS_TEAMS', label: 'Microsoft Teams', prefix: 'Teams' },
  { type: 'GOOGLE_CHAT', label: 'Google Chat', prefix: 'Chat' },
] as const;

const hasLicense = !!process.env.LICENSE_KEY;
const DESTINATION_TYPES = hasLicense
  ? [...COMMUNITY_DESTINATION_TYPES, ...ENTERPRISE_DESTINATION_TYPES]
  : COMMUNITY_DESTINATION_TYPES;

for (const { type, label, prefix } of DESTINATION_TYPES) {
  test.describe(`Destinations - ${label} CRUD`, () => {
    let datamartId: string;
    let destTitle: string;

    test.beforeEach(async ({ apiHelpers }) => {
      const { datamart } = await apiHelpers.createPublishedDataMart();
      datamartId = datamart.id;
      destTitle = `${label} Dest ${Date.now()}`;
      await apiHelpers.createDestination(type, destTitle);
    });

    test(`renders ${label} destination card on DM tab`, async ({ page }) => {
      await page.goto(`/ui/0/data-marts/${datamartId}/reports`);
      const destTab = page.getByTestId(TESTIDS.destTab);
      await expect(destTab).toBeVisible();

      const card = destTab.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
      await expect(card).toBeVisible();
    });

    test(`edits ${label} destination title`, async ({ page }) => {
      await page.goto('/ui/0/data-destinations');
      await expect(page.getByTestId(TESTIDS.destTab)).toBeVisible();

      await page.getByText(destTitle).click();
      const sheet = page.getByTestId(TESTIDS.destEditSheet);
      await expect(sheet).toBeVisible();

      const titleInput = sheet.getByLabel('Title');
      await titleInput.fill('');
      const updatedTitle = `Updated ${prefix} ${Date.now()}`;
      await titleInput.fill(updatedTitle);

      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).not.toBeVisible();

      await expect(page.getByText(updatedTitle)).toBeVisible();
    });

    test(`deletes ${label} destination`, async ({ page, radix }) => {
      await page.goto('/ui/0/data-destinations');
      await expect(page.getByTestId(TESTIDS.destTab)).toBeVisible();

      await expect(page.getByText(destTitle)).toBeVisible();

      const row = page.locator('tr', { hasText: destTitle });
      await row.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await radix.confirmDialog('Delete');

      await expect(page.getByText(destTitle)).not.toBeVisible();
    });
  });
}

// ---------------------------------------------------------------------------
// DEST-04: Google Sheets destination (credential-gated)
// ---------------------------------------------------------------------------
describeIfCredentials(
  ['GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON'],
  'Destinations - Google Sheets CRUD (DEST-04)',
  () => {
    test('creates Google Sheets destination via UI (DEST-04)', async ({ page }) => {
      await page.goto('/ui/0/data-destinations');
      await expect(page.getByTestId(TESTIDS.destTab)).toBeVisible();

      // Click "New Destination" button
      await page.getByTestId(TESTIDS.destCreateButton).click();

      const sheet = page.getByTestId(TESTIDS.destEditSheet);
      await expect(sheet).toBeVisible();

      // Title is pre-filled with "New Destination"; update it
      const titleInput = sheet.getByLabel('Title');
      await titleInput.fill('');
      const gsTitle = `GSheets Dest ${Date.now()}`;
      await titleInput.fill(gsTitle);

      // Google Sheets is the default type, so no need to change type select

      // Save
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).not.toBeVisible();

      // Verify destination appears
      await expect(page.getByText(gsTitle)).toBeVisible();
    });

    test('edits Google Sheets destination title (DEST-07)', async () => {
      // TODO: Full UI flow for Google Sheets edit when credentials available
      test.skip();
    });

    test('deletes Google Sheets destination (DEST-08)', async () => {
      // TODO: Full UI flow for Google Sheets delete when credentials available
      test.skip();
    });
  }
);
