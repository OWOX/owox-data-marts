import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';
import { describeIfCredentials } from '../helpers/credentials';

// ---------------------------------------------------------------------------
// STOR-01 + STOR-02: Create each of the 5 active storage types via UI
// ---------------------------------------------------------------------------

test.describe('Storage Type Creation', () => {
  test('create Google BigQuery storage', async ({ page }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    await page.getByRole('button', { name: 'New Storage' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).toBeVisible();

    await page.getByRole('button', { name: 'Google BigQuery' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).not.toBeVisible();
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(
      page.getByTestId(TESTIDS.storageTable).getByText('Google BigQuery').first()
    ).toBeVisible();
  });

  test('create AWS Redshift storage', async ({ page }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    await page.getByRole('button', { name: 'New Storage' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).toBeVisible();

    await page.getByRole('button', { name: 'AWS Redshift' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).not.toBeVisible();
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(
      page.getByTestId(TESTIDS.storageTable).getByText('AWS Redshift').first()
    ).toBeVisible();
  });

  test('create Snowflake storage', async ({ page }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    await page.getByRole('button', { name: 'New Storage' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).toBeVisible();

    await page.getByRole('button', { name: 'Snowflake' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).not.toBeVisible();
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(
      page.getByTestId(TESTIDS.storageTable).getByText('Snowflake').first()
    ).toBeVisible();
  });

  test('create Databricks storage', async ({ page }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    await page.getByRole('button', { name: 'New Storage' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).toBeVisible();

    await page.getByRole('button', { name: 'Databricks' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).not.toBeVisible();
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(
      page.getByTestId(TESTIDS.storageTable).getByText('Databricks').first()
    ).toBeVisible();
  });

  test('create AWS Athena storage', async ({ page }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    await page.getByRole('button', { name: 'New Storage' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).toBeVisible();

    await page.getByRole('button', { name: 'AWS Athena' }).click();
    await expect(page.getByTestId(TESTIDS.storageTypeDialog)).not.toBeVisible();
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(
      page.getByTestId(TESTIDS.storageTable).getByText('AWS Athena').first()
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// STOR-03: Config sheet opens with type-specific form fields
// ---------------------------------------------------------------------------

test.describe('Storage Config Sheet', () => {
  test.beforeEach(async ({ apiHelpers }) => {
    await apiHelpers.createStorage('GOOGLE_BIGQUERY');
  });

  test('opens config sheet with edit form via menu', async ({ page }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    // Open 3-dot menu for a storage row
    await page.getByRole('button', { name: 'Open menu' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    // Verify sheet and form are visible
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).toBeVisible();
    await expect(page.getByTestId(TESTIDS.storageEditForm)).toBeVisible();

    // Dismiss the sheet via Cancel button (Escape may not close when form has unsaved state)
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// STOR-07: Validation errors appear when saving with empty required fields
// ---------------------------------------------------------------------------

test.describe('Storage Validation', () => {
  const STORAGE_TYPES = [
    'GOOGLE_BIGQUERY',
    'AWS_REDSHIFT',
    'SNOWFLAKE',
    'DATABRICKS',
    'AWS_ATHENA',
  ] as const;

  for (const storageType of STORAGE_TYPES) {
    test(`shows validation errors for ${storageType} with empty fields`, async ({
      page,
      apiHelpers,
    }) => {
      await apiHelpers.createStorage(storageType);
      await page.goto('/ui/0/data-storages');
      await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

      await page.getByRole('button', { name: 'Open menu' }).first().click();
      await page.getByRole('menuitem', { name: 'Edit' }).click();
      await expect(page.getByTestId(TESTIDS.storageEditForm)).toBeVisible();

      // Clear the Title field
      const titleInput = page.getByTestId(TESTIDS.storageEditForm).getByLabel('Title');
      await titleInput.click();
      await titleInput.fill('');

      // Click Save without filling required fields
      await page.getByRole('button', { name: 'Save' }).click();

      // Verify validation error messages appear
      const form = page.getByTestId(TESTIDS.storageEditForm);
      await expect(form.locator('[data-slot="form-message"]').first()).toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------
// STOR-04: BigQuery config save with real credentials (credential-gated)
// ---------------------------------------------------------------------------

describeIfCredentials(
  ['BIGQUERY_PROJECT_ID', 'BIGQUERY_CREDENTIALS_JSON'],
  'BigQuery Config Save',
  () => {
    test('saves BigQuery config with real credentials', async ({ page, apiHelpers }) => {
      await apiHelpers.createStorage('GOOGLE_BIGQUERY');
      await page.goto('/ui/0/data-storages');
      await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

      // Open config sheet
      await page.getByRole('button', { name: 'Open menu' }).first().click();
      await page.getByRole('menuitem', { name: 'Edit' }).click();
      await expect(page.getByTestId(TESTIDS.storageEditForm)).toBeVisible();

      const form = page.getByTestId(TESTIDS.storageEditForm);

      // Fill BigQuery-specific fields from env vars
      const projectId = process.env.BIGQUERY_PROJECT_ID!;
      const credentials = process.env.BIGQUERY_CREDENTIALS_JSON!;

      await form.getByLabel('Project ID').fill(projectId);
      await form.getByLabel('Credentials JSON').fill(credentials);

      // Save and verify sheet closes (indicating success)
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByTestId(TESTIDS.storageConfigSheet)).not.toBeVisible({
        timeout: 10000,
      });
    });
  }
);

// ---------------------------------------------------------------------------
// STOR-05: Athena config save with real credentials (credential-gated)
// ---------------------------------------------------------------------------

describeIfCredentials(['AWS_ACCESS_KEY_ID', 'AWS_REGION'], 'Athena Config Save', () => {
  test('saves Athena config with real credentials', async ({ page, apiHelpers }) => {
    await apiHelpers.createStorage('AWS_ATHENA');
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    // Open config sheet
    await page.getByRole('button', { name: 'Open menu' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByTestId(TESTIDS.storageEditForm)).toBeVisible();

    const form = page.getByTestId(TESTIDS.storageEditForm);

    // Fill Athena-specific fields from env vars
    const region = process.env.AWS_REGION!;
    await form.getByLabel('Region').fill(region);

    // Save and verify sheet closes (indicating success)
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId(TESTIDS.storageConfigSheet)).not.toBeVisible({
      timeout: 10000,
    });
  });
});

// ---------------------------------------------------------------------------
// STOR-06: Delete storage with confirmation dialog
// ---------------------------------------------------------------------------

test.describe('Storage Delete', () => {
  test.beforeEach(async ({ apiHelpers }) => {
    await apiHelpers.createStorage('GOOGLE_BIGQUERY');
  });

  test('deletes storage via 3-dot menu with confirmation', async ({ page, radix }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId(TESTIDS.storageListPage)).toBeVisible();

    // Verify the storage row exists (UI renders human-readable "Google BigQuery")
    const row = page.locator('tr', { hasText: 'Google BigQuery' }).first();
    await expect(row).toBeVisible();

    // Hover to reveal the 3-dot menu, then click Delete
    await row.hover();
    await row.getByRole('button', { name: 'Open menu' }).click();
    await page.getByTestId(TESTIDS.storageDeleteButton).click();

    // Confirm deletion in the dialog
    await radix.confirmDialog('Delete');

    // Verify the row disappears
    await expect(row).not.toBeVisible({ timeout: 10000 });
  });
});
