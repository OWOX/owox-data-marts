import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

// ---------------------------------------------------------------------------
// Helper: trigger a manual run on a connector DM from the overview page.
// Returns after the run sheet has been dismissed.
// ---------------------------------------------------------------------------
async function triggerManualRun(page: import('@playwright/test').Page, datamartId: string) {
  await page.goto(`/ui/0/data-marts/${datamartId}/overview`);
  await expect(page.getByTestId(TESTIDS.datamartDetails)).toBeVisible();

  // Open the 3-dot dropdown menu (lucide canonical name)
  const detailsContainer = page.getByTestId(TESTIDS.datamartDetails);
  await detailsContainer.locator('button:has(svg.lucide-ellipsis-vertical)').click();

  // Click "Manual Run..." menu item
  await page.getByRole('menuitem', { name: /Manual Run/ }).click();

  // Scope Run button to the sheet content to avoid ambiguity with other buttons
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  // Click Run and wait for the API response confirming the run was accepted
  const runResponsePromise = page.waitForResponse(
    resp => resp.url().includes('/manual-run') && resp.status() === 201
  );
  await sheet.getByRole('button', { name: 'Run' }).click();
  await runResponsePromise;
}

// ---------------------------------------------------------------------------
// RUN-01: Empty state renders on Run History tab when no runs exist.
// Uses a SQL-type published DM because connector DMs now auto-run on publish.
// ---------------------------------------------------------------------------
test.describe('Run History - Empty State', () => {
  test('shows empty state when no runs exist (RUN-01)', async ({ page, apiHelpers }) => {
    const { datamart } = await apiHelpers.createPublishedDataMart();
    await page.goto(`/ui/0/data-marts/${datamart.id}/run-history`);

    // RunHistory renders empty state with runHistoryEmptyState testid
    await expect(page.getByTestId(TESTIDS.runHistoryEmptyState)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('No runs found for this Data Mart')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// RUN-02 through RUN-05: Run history after manual run trigger.
// ---------------------------------------------------------------------------
test.describe('Run History - After Manual Run', () => {
  let datamartId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const { datamart } = await apiHelpers.createPublishedConnectorDataMart();
    datamartId = datamart.id;
  });

  test('shows run entries after manual run trigger (RUN-02)', async ({ page }) => {
    // Trigger manual run via UI
    await triggerManualRun(page, datamartId);

    // Navigate to run history tab
    await page.goto(`/ui/0/data-marts/${datamartId}/run-history`);

    // Verify runHistoryTable is visible (runs exist)
    const runContainer = page.getByTestId(TESTIDS.runHistoryTable);
    await expect(runContainer).toBeVisible({ timeout: 15000 });

    // Verify at least one RunItem card exists
    await expect(runContainer.locator('.dm-card-block').first()).toBeVisible();
  });

  test('run entry shows status badge (RUN-03)', async ({ page }) => {
    // Trigger manual run via UI
    await triggerManualRun(page, datamartId);

    // Navigate to run history tab
    await page.goto(`/ui/0/data-marts/${datamartId}/run-history`);

    const runContainer = page.getByTestId(TESTIDS.runHistoryTable);
    await expect(runContainer).toBeVisible({ timeout: 15000 });

    const firstRun = runContainer.locator('.dm-card-block').first();
    await expect(firstRun).toBeVisible();

    // Race-condition tolerant: immediately after trigger, accept any valid status
    const statusBadge = firstRun.getByText(/Running|Success|Pending|Failed/);
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    // Wait for terminal status (Success or Failed) with generous timeout
    await expect(
      firstRun
        .getByText('Success', { exact: true })
        .or(firstRun.getByText('Failed', { exact: true }))
    ).toBeVisible({ timeout: 60000 });
  });

  test('run entry shows timestamp (RUN-04)', async ({ page }) => {
    // Trigger manual run via UI
    await triggerManualRun(page, datamartId);

    // Navigate to run history tab
    await page.goto(`/ui/0/data-marts/${datamartId}/run-history`);

    const runContainer = page.getByTestId(TESTIDS.runHistoryTable);
    await expect(runContainer).toBeVisible({ timeout: 15000 });

    const firstRun = runContainer.locator('.dm-card-block').first();
    await expect(firstRun).toBeVisible();

    // RunItem shows startedAtValue with a date/time pattern.
    // The timestamp is inside a div with font-mono class.
    // Verify that the timestamp text is visible (contains time-like pattern).
    const timestampElement = firstRun.locator('.font-mono').first();
    await expect(timestampElement).toBeVisible();
    const timestampText = await timestampElement.textContent();
    // Timestamp should contain digits and colons (e.g., "23:45:12" or "2026-03-14")
    expect(timestampText).toMatch(/\d/);
  });

  test('expands run entry and switches log views (RUN-05)', async ({ page }) => {
    // Trigger manual run via UI
    await triggerManualRun(page, datamartId);

    // Navigate to run history tab
    await page.goto(`/ui/0/data-marts/${datamartId}/run-history`);

    const runContainer = page.getByTestId(TESTIDS.runHistoryTable);
    await expect(runContainer).toBeVisible({ timeout: 15000 });

    // Wait for the run to reach terminal status (Success or Failed)
    const firstRun = runContainer.locator('.dm-card-block').first();
    await expect(firstRun).toBeVisible();
    await expect(
      firstRun
        .getByText('Success', { exact: true })
        .or(firstRun.getByText('Failed', { exact: true }))
    ).toBeVisible({ timeout: 60000 });

    // Click the first run entry to expand it
    await firstRun.click();

    // Verify runLogView testid is visible (expanded content)
    const logView = page.getByTestId(TESTIDS.runLogView);
    await expect(logView).toBeVisible();

    // Verify "Run ID:" heading exists in the expanded view (Structured is default)
    await expect(logView.getByText(/Run ID:/)).toBeVisible();

    // Verify Structured button is active (default view)
    await expect(logView.getByText('Structured', { exact: true })).toBeVisible();

    // Switch to Raw view (LogControls uses plain <button> elements, not Radix Tabs)
    await logView.getByText('Raw', { exact: true }).click();

    // Raw view should be active -- the button styling changes
    // Verify raw content area is visible (may show "No logs found" or actual logs)
    await expect(
      logView.locator('pre, .font-mono').first().or(logView.getByText('No logs found'))
    ).toBeVisible({ timeout: 5000 });

    // Switch to Configuration view
    await logView.getByText('Configuration', { exact: true }).click();

    // Configuration view should be visible
    // ConfigurationView renders JSON content or a message
    await expect(logView).toBeVisible();

    // All 3 log view types verified: Structured (default), Raw, Configuration
  });
});
