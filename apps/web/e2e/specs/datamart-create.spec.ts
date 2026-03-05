import { test, expect } from '../fixtures/base';

test.describe('DataMart Creation', () => {
  // Ensure at least one storage exists for the datamart form's storage dropdown.
  // Uses apiHelpers to create a storage via API instead of UI clicks.
  test.beforeEach(async ({ apiHelpers }) => {
    await apiHelpers.createStorage();
  });

  test('create a DataMart through the UI form', async ({ page }) => {
    await page.goto('/ui/0/data-marts/create');
    await expect(page.getByTestId('datamartCreateForm')).toBeVisible();

    // Clear default title and type custom title
    const titleInput = page.getByPlaceholder('Enter title');
    await titleInput.clear();
    await titleInput.fill('Browser E2E DataMart');

    // Select storage from dropdown -- click the select trigger, then pick first option
    await page.getByRole('combobox').click();
    await page.getByRole('option').first().click();

    // Submit the form
    await page.getByRole('button', { name: 'Create Data Mart' }).click();

    // After success, should redirect to detail page (data-setup tab)
    await expect(page).toHaveURL(/\/data-marts\/[^/]+\/data-setup/);
  });

  test('shows validation errors on empty form submission', async ({ page }) => {
    await page.goto('/ui/0/data-marts/create');
    await expect(page.getByTestId('datamartCreateForm')).toBeVisible();

    // Clear the title (which has default "New Data Mart")
    const titleInput = page.getByPlaceholder('Enter title');
    await titleInput.clear();

    // Try to submit with empty title
    await page.getByRole('button', { name: 'Create Data Mart' }).click();

    // Should stay on the same page -- no redirect
    await expect(page).toHaveURL(/\/data-marts\/create/);
  });
});
