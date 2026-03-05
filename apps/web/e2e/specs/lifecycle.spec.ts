import { test, expect } from '../fixtures/base';

test.describe('DataMart Full Lifecycle', () => {
  test('create storage -> create datamart -> set SQL definition -> publish -> verify Published status', async ({
    page,
    apiHelpers,
  }) => {
    // Step 1: Create a DataStorage via API
    await apiHelpers.createStorage();

    // Step 2: Create a DataMart via UI
    await page.goto('/ui/0/data-marts/create');
    await expect(page.getByTestId('datamartCreateForm')).toBeVisible();

    const titleInput = page.getByPlaceholder('Enter title');
    await titleInput.clear();
    await titleInput.fill('Lifecycle E2E DataMart');

    // Select storage from dropdown
    await page.getByRole('combobox').click();
    await page.getByRole('option').first().click();

    // Submit
    await page.getByRole('button', { name: 'Create Data Mart' }).click();

    // After success, redirects to data-setup page
    await expect(page).toHaveURL(/\/data-marts\/[^/]+\/data-setup/);

    // Extract the datamart ID from the URL
    const url = page.url();
    const datamartId = url.match(/data-marts\/([^/]+)/)?.[1];
    expect(datamartId).toBeTruthy();

    // Step 3: Set SQL definition via API helper
    await apiHelpers.setDefinition(datamartId!);

    // Step 4: Publish via API helper
    await apiHelpers.publish(datamartId!);

    // Step 5: Reload to reflect the updated status in the UI
    await page.reload();
    await expect(page.getByTestId('datamartDetails')).toBeVisible();

    // Navigate to overview to see the status label
    await page.getByRole('link', { name: 'Overview' }).click();
    await expect(page).toHaveURL(new RegExp(`/data-marts/${datamartId}/overview`));

    // Verify the Published status label is visible
    await expect(page.getByText('Published')).toBeVisible();

    // Verify the Publish button is no longer shown (only visible for DRAFT status)
    await expect(page.getByTestId('datamartPublishButton')).not.toBeVisible();
  });
});
