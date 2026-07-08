import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

/**
 * Regression guard for sheet-hosted confirmation dialogs.
 *
 * PR #1355 fixed a dismissal loop by rendering ConfirmationDialog inside
 * SheetContent. These tests exercise the real Radix dismissable-layer stack
 * (outside happy-dom) and fail if the dialog is moved back outside the sheet.
 */

const MEMBERS_URL = '/ui/0/project-settings/members';

const MOCK_MEMBERSHIP_REQUESTS = [
  {
    requestId: 'mock-req-bob',
    email: 'bob@example.com',
    fullName: 'Bob Example',
    avatar: null,
    userId: 'user-bob',
    requestedRole: 'editor',
    createdAt: new Date().toISOString(),
  },
];

async function mockMembershipRequestRoutes(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/members/requests', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_MEMBERSHIP_REQUESTS),
      });
    }
    return route.continue();
  });

  await page.route('**/api/members/requests/*/decline', route => {
    return route.fulfill({ status: 204, body: '' });
  });
}

test.describe('Sheet-hosted confirmation dialogs', () => {
  test.describe('Storage config sheet — unsaved changes guard', () => {
    test.beforeEach(async ({ apiHelpers }) => {
      await apiHelpers.createStorage('GOOGLE_BIGQUERY');
    });

    test('keeps the sheet open when the user cancels leaving dirty form', async ({
      page,
      radix,
    }) => {
      await page.goto('/ui/0/data-storages');
      await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

      await page.getByRole('button', { name: 'Open menu' }).first().click();
      await page.getByRole('menuitem', { name: 'Edit' }).click();

      const sheet = page.getByTestId(TESTIDS.storageConfigSheet);
      const form = page.getByTestId(TESTIDS.storageEditForm);
      await expect(sheet).toBeVisible();
      await expect(form).toBeVisible();

      const titleInput = form.getByLabel('Title');
      await titleInput.click();
      await titleInput.fill('Dirty storage title');

      await page.getByRole('button', { name: 'Cancel' }).click();
      await radix.stayOnDirtySheet(sheet);

      // Guard against the original re-open loop: dialog must not immediately return.
      await expect(radix.confirmationDialog()).not.toBeVisible();
      await expect(sheet).toBeVisible();
      await expect(titleInput).toHaveValue('Dirty storage title');
    });

    test('closes the sheet when the user confirms leaving dirty form', async ({
      page,
      radix,
    }) => {
      await page.goto('/ui/0/data-storages');
      await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

      await page.getByRole('button', { name: 'Open menu' }).first().click();
      await page.getByRole('menuitem', { name: 'Edit' }).click();

      const sheet = page.getByTestId(TESTIDS.storageConfigSheet);
      const form = page.getByTestId(TESTIDS.storageEditForm);
      await expect(sheet).toBeVisible();

      const titleInput = form.getByLabel('Title');
      await titleInput.click();
      await titleInput.fill('Dirty storage title');

      await page.keyboard.press('Escape');
      await radix.leaveDirtySheet(sheet);
    });
  });

  test.describe('Membership request sheet — decline confirmation', () => {
    test.beforeEach(async ({ page }) => {
      await mockMembershipRequestRoutes(page);
      await page.goto(MEMBERS_URL);
      await expect(page.getByTestId(TESTIDS.pendingRequestsSection)).toBeVisible({
        timeout: 25_000,
      });
    });

    test('keeps the sheet open when decline confirmation is cancelled', async ({ page, radix }) => {
      await page.getByText('bob@example.com').click();

      const sheet = page.getByTestId(TESTIDS.membershipRequestSheet);
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText('bob@example.com')).toBeVisible();

      await sheet.getByRole('button', { name: /Decline request/i }).click();
      await expect(
        page.getByRole('heading', { name: /Decline membership request/i })
      ).toBeVisible();

      await radix.cancelSheetHostedDialog(sheet, 'Cancel');

      await expect(radix.confirmationDialog()).not.toBeVisible();
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText('bob@example.com')).toBeVisible();
    });

    test('closes the sheet when decline is confirmed', async ({ page, radix }) => {
      await page.getByText('bob@example.com').click();

      const sheet = page.getByTestId(TESTIDS.membershipRequestSheet);
      await expect(sheet).toBeVisible();

      await sheet.getByRole('button', { name: /Decline request/i }).click();
      await expect(
        page.getByRole('heading', { name: /Decline membership request/i })
      ).toBeVisible();

      await radix.confirmDialog('Decline');
      await expect(sheet).not.toBeVisible();
      await expect(page.getByText('bob@example.com')).toBeHidden();
    });
  });
});