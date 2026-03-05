import { test, expect } from '../fixtures/base';
import type { ConsoleMessage } from '@playwright/test';
import { ApiHelpers } from '../fixtures/api-helpers';

// The 5 always-visible tabs. Insights and Next Insights tabs are gated by
// feature flags (INSIGHTS_ENABLED, INSIGHT_ASSISTANT_ENABLED_PROJECT_IDS) and
// are not visible in standalone mode where /api/flags returns {}.
const ALWAYS_VISIBLE_TABS = [
  { name: 'Overview', path: 'overview' },
  { name: 'Data Setup', path: 'data-setup' },
  { name: 'Destinations', path: 'reports' },
  { name: 'Triggers', path: 'triggers' },
  { name: 'Run History', path: 'run-history' },
];

test.describe('DataMart Detail Tabs Navigation', () => {
  let datamartId: string;

  // Create a DataMart as a prerequisite for all tab navigation tests.
  // Uses ApiHelpers via manual instantiation since beforeAll receives { browser }, not { page }.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    const api = new ApiHelpers(page);

    const storage = await api.createStorage();
    const dm = await api.createDataMart(storage.id, 'Tabs E2E DataMart');
    datamartId = dm.id;

    await page.close();
  });

  test('all 5 visible tabs render without console errors and show expected content', async ({
    page,
  }) => {
    // Collect console errors during navigation
    const consoleErrors: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter out known non-critical errors from third-party scripts and React warnings
        const isIgnorable =
          text.includes('intercom') ||
          text.includes('Intercom') ||
          text.includes('gtm') ||
          text.includes('googletagmanager') ||
          text.includes('analytics') ||
          text.includes('Failed to load resource') ||
          text.includes('net::ERR_') ||
          // React DOM property warnings (e.g., stop-color vs stopColor in SVGs)
          text.includes('Invalid DOM property') ||
          text.includes('Did you mean');
        if (!isIgnorable) {
          consoleErrors.push(text);
        }
      }
    });

    // Navigate to the datamart overview tab first
    await page.goto(`/ui/0/data-marts/${datamartId}/overview`);
    await expect(page.getByTestId('datamartDetails')).toBeVisible();

    const tabNav = page.getByTestId('datamartTabNav');
    await expect(tabNav).toBeVisible();

    for (const tab of ALWAYS_VISIBLE_TABS) {
      // Click the tab link scoped within the tab navigation to avoid sidebar duplicates
      await tabNav.getByRole('link', { name: tab.name, exact: true }).click();

      // Verify URL contains the correct path segment
      await expect(page).toHaveURL(new RegExp(`/${tab.path}(?:\\?|$)`));

      // Verify tab-specific content renders
      switch (tab.name) {
        case 'Overview':
          // Overview shows description area with the datamartTabOverview testid
          await expect(page.getByTestId('datamartTabOverview')).toBeVisible();
          break;

        case 'Data Setup':
          // Data Setup shows storage, input source, and output schema cards
          await expect(page.getByTestId('datamartTabDataSetup')).toBeVisible();
          break;

        case 'Destinations':
          // Destinations tab may show empty state or a list -- just verify the tab rendered
          await expect(page.getByTestId('datamartDetails')).toBeVisible();
          break;

        case 'Triggers':
          // Triggers tab may show empty state or scheduled triggers
          await expect(page.getByTestId('datamartDetails')).toBeVisible();
          break;

        case 'Run History':
          // Run History tab shows run list (possibly empty)
          await expect(page.getByTestId('datamartDetails')).toBeVisible();
          break;
      }
    }

    // After navigating through all tabs, verify no console errors occurred
    expect(consoleErrors).toEqual([]);
  });
});
