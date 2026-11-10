import { test as base, expect, type Locator } from '@playwright/test';
import { ApiHelpers, resetDatabase } from './api-helpers';
import { RadixHelpers } from '../helpers/radix';

// The What's new card loads this feed from the live docs site and opens over the page. Every
// test gets an empty feed instead; a spec about the card routes its own.
const RELEASE_FEED_URL = 'https://docs.owox.com/docs/releases.json';

export const test = base.extend<{
  apiHelpers: ApiHelpers;
  radix: RadixHelpers;
  emptyReleaseFeed: undefined;
}>({
  emptyReleaseFeed: [
    async ({ context }, use) => {
      await context.route(RELEASE_FEED_URL, route => route.fulfill({ json: { releases: [] } }));
      await use(undefined);
    },
    { auto: true },
  ],
  apiHelpers: async ({ page }, use) => {
    // Reset DB before each test to prevent data leakage between specs
    resetDatabase();
    await use(new ApiHelpers(page));
  },
  radix: async ({ page }, use) => {
    await use(new RadixHelpers(page));
  },
});

export { expect, type Locator };
