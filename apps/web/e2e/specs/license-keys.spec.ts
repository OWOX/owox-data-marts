import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/base';

const LICENSE_KEYS_URL = '/ui/0/project-settings/license-keys';
const SIGNED_LICENSE = 'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2V5In0.signed.license';

async function mockLicenseKeyRoutes(page: Page): Promise<void> {
  let key: Record<string, unknown> | null = null;

  await page.route('**/api/flags', route =>
    route.fulfill({ json: { LICENSE_ISSUANCE_ENABLED: 'true' } })
  );
  await page.route('**/api/members/requests', route => route.fulfill({ json: [] }));
  await page.route(/\/api\/license-keys(?:\/[^/?]+)?(?:\?.*)?$/, async route => {
    const request = route.request();

    if (request.method() === 'GET') {
      return route.fulfill({ json: key ? [key] : [] });
    }
    if (request.method() === 'POST') {
      const payload = request.postDataJSON() as { name: string; origin: string };
      key = {
        licenseKeyId: '15f0b280-6b2f-49c7-9c58-d26a5906e2cd',
        ...payload,
        expiresAt: '2027-08-12T12:00:00.000Z',
        lastUsedAt: null,
        createdAt: '2026-08-12T12:00:00.000Z',
        createdByUser: null,
      };
      return route.fulfill({ status: 201, json: { ...key, licenseKey: SIGNED_LICENSE } });
    }
    if (request.method() === 'PATCH') {
      key = { ...key, ...(request.postDataJSON() as { name: string }) };
      return route.fulfill({ json: key });
    }

    key = null;
    return route.fulfill({ status: 204, body: '' });
  });
}

test('creates, reveals once, renames and revokes a license key', async ({ page }) => {
  await mockLicenseKeyRoutes(page);
  await page.goto(LICENSE_KEYS_URL);

  await page.getByRole('button', { name: 'Create license key' }).click();
  const createSheet = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Create license key' }),
  });
  await createSheet.locator('input[name="name"]').fill('Production');
  await createSheet.locator('input[name="origin"]').fill('https://customer.example');
  await createSheet.getByRole('button', { name: 'Create', exact: true }).click();

  const revealDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'License key created' }),
  });
  await expect(revealDialog).toBeVisible();
  await revealDialog.getByRole('button', { name: 'Show License key' }).click();
  await expect(revealDialog.locator('input')).toHaveValue(SIGNED_LICENSE);
  await revealDialog.getByRole('button', { name: 'I have saved the license key' }).click();

  await page.getByText('Production', { exact: true }).click();
  const editSheet = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'License Key Details' }),
  });
  await expect(editSheet.getByText(/only shown once, right after creation/i)).toBeVisible();
  await editSheet.locator('input[name="name"]').fill('Production EU');
  await editSheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Production EU', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'License key actions' }).click();
  await page.getByRole('menuitem', { name: 'Revoke' }).click();
  await page.getByRole('button', { name: 'Revoke', exact: true }).last().click();

  await expect(page.getByText(/doesn't have any license keys yet/i)).toBeVisible();
});
