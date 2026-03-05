import { test as base, expect } from '@playwright/test';
import { ApiHelpers } from './api-helpers';
import { RadixHelpers } from '../helpers/radix';

export const test = base.extend<{
  apiHelpers: ApiHelpers;
  radix: RadixHelpers;
}>({
  apiHelpers: async ({ page }, use) => {
    await use(new ApiHelpers(page));
  },
  radix: async ({ page }, use) => {
    await use(new RadixHelpers(page));
  },
});

export { expect };
