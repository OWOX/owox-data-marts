import { test } from '@playwright/test';

/**
 * Conditionally run a test.describe block only when all required
 * environment variables are present. When any variable is missing
 * the describe block is created with a single `test.skip` so the
 * reporter shows which suites were skipped and why.
 */
export function describeIfCredentials(envVars: string[], title: string, fn: () => void): void {
  const available = envVars.every(v => !!process.env[v]);
  if (!available) {
    const missing = envVars.filter(v => !process.env[v]).join(', ');
    test.describe(title, () => {
      test.skip(true, `Skipping: missing env vars ${missing}`);
    });
  } else {
    test.describe(title, fn);
  }
}
