import { test, expect } from '../fixtures/base';
import type { Locator, Page } from '@playwright/test';

async function checkAssistantPrompts(page: Page, container: Locator, dataMartId?: string) {
  for (const name of ['ChatGPT', 'Claude']) {
    await container.getByRole('button', { name, exact: true }).click();
    const menu = page.getByRole('menu');
    let browserPrompt: string | null = null;
    for (const label of ['Open in browser', 'Open in desktop app']) {
      const link = menu.getByRole('menuitem', { name: label });
      const url = new URL((await link.getAttribute('href'))!);
      const isDesktop = label === 'Open in desktop app';
      expect(url.protocol).toBe(isDesktop ? (name === 'ChatGPT' ? 'codex:' : 'claude:') : 'https:');
      const prompt = url.searchParams.get(isDesktop && name === 'ChatGPT' ? 'prompt' : 'q');
      expect(prompt).toContain('Project ID: 0');
      if (dataMartId) {
        expect(prompt).toContain(`Data Mart ID: ${dataMartId}`);
      } else {
        expect(prompt).not.toContain('Data Mart ID:');
      }
      if (isDesktop) expect(prompt).toBe(browserPrompt);
      else browserPrompt = prompt;
    }
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
  }
}

test.describe('DataMart Creation', () => {
  // Ensure at least one storage exists for the datamart form's storage dropdown.
  // Uses apiHelpers to create a storage via API instead of UI clicks.
  test.beforeEach(async ({ apiHelpers }) => {
    await apiHelpers.createStorage();
  });

  test('create a DataMart through the UI form', async ({ page }) => {
    await page.goto('/ui/0/data-marts/create');
    await expect(page.getByTestId('datamartCreateForm')).toBeVisible();
    await checkAssistantPrompts(page, page.getByTestId('datamartCreatePage'));
    const chatgpt = page
      .getByTestId('datamartCreatePage')
      .getByRole('button', { name: 'ChatGPT', exact: true });
    const copy = page.getByRole('button', { name: 'Copy prompt' });
    const container = (await chatgpt.locator('..').boundingBox())!;
    const first = (await chatgpt.boundingBox())!;
    const last = (await copy.boundingBox())!;
    const actionsCenter = (first.x + last.x + last.width) / 2;
    expect(Math.abs(actionsCenter - (container.x + container.width / 2))).toBeLessThanOrEqual(1);

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
    const dataMartId = new URL(page.url()).pathname.split('/')[4];
    const promo = page.locator('[data-sonner-toast]').filter({
      hasText: 'You can continue setup with an AI assistant',
    });
    await expect(promo).toBeVisible();
    await checkAssistantPrompts(page, promo, dataMartId);
    await expect(promo.getByRole('button', { name: 'Copy prompt' })).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('datamartDetails')).toBeVisible();
    await expect(promo).not.toBeVisible();
  });

  test('does not show a UI creation promo on a direct MCP setup link', async ({
    page,
    apiHelpers,
  }) => {
    const storage = await apiHelpers.createStorage();
    const dataMart = await apiHelpers.createDataMart(storage.id, 'MCP-created draft');

    await page.goto(
      `/ui/0/data-marts/${dataMart.id}/data-setup?preset=connector&connectorName=GoogleSheets`
    );

    await expect(page.getByTestId('datamartDetails')).toBeVisible();
    await expect(page.getByText('You can continue setup with an AI assistant')).not.toBeVisible();
    await expect(page).toHaveURL(/preset=connector&connectorName=GoogleSheets/);
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
