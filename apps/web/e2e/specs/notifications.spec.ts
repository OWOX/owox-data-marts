import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

test.describe('Notification Settings', () => {
  test('page renders with notification settings table', async ({ page }) => {
    await page.goto('/ui/0/notifications');
    await expect(page.getByTestId(TESTIDS.notifPage)).toBeVisible();
    await expect(page.getByText('Notification settings')).toBeVisible();
    await expect(page.getByTestId(TESTIDS.notifSettingsTable)).toBeVisible();
  });

  test('toggle notification enabled/disabled', async ({ page }) => {
    await page.goto('/ui/0/notifications');
    await expect(page.getByTestId(TESTIDS.notifSettingsTable)).toBeVisible();

    // Find the first toggle switch
    const toggle = page.getByTestId(TESTIDS.notifToggle).first();
    await expect(toggle).toBeVisible();

    // Get current state
    const wasChecked = await toggle.getAttribute('aria-checked');

    // Click toggle
    await toggle.click();

    // UI waits for API response before updating state (not optimistic).
    // Use Playwright's auto-retrying assertion to wait for the re-render.
    const expectedChecked = wasChecked === 'true' ? 'false' : 'true';
    await expect(toggle).toHaveAttribute('aria-checked', expectedChecked);
  });

  test('edit notification settings via sheet', async ({ page }) => {
    await page.goto('/ui/0/notifications');
    await expect(page.getByTestId(TESTIDS.notifSettingsTable)).toBeVisible();

    // Click on a row (NOT the switch) to open the edit sheet.
    // Click on the first row's text content (title/name area).
    const firstRow = page
      .getByTestId(TESTIDS.notifSettingsTable)
      .locator('tbody tr')
      .first();
    // Click on a text cell, avoiding the switch
    await firstRow.locator('td').first().click();

    // Verify edit sheet opens
    await expect(page.getByTestId(TESTIDS.notifEditSheet)).toBeVisible();
  });
});
