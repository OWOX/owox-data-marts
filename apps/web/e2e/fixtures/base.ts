import { test as base, expect, type Locator } from '@playwright/test';
import { ApiHelpers, resetDatabase } from './api-helpers';
import { RadixHelpers } from '../helpers/radix';

export const test = base.extend<{
  apiHelpers: ApiHelpers;
  radix: RadixHelpers;
}>({
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
