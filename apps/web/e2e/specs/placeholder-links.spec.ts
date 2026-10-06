import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';

const PLUGIN = '00000000-0000-4000-8000-000000000001';
const REDIRECT_KEY = 'owox_auth_redirect_url';

// The null IDP sets its session cookie at sign-in; page.request shares the page's cookies.
async function openSession(page: Page): Promise<void> {
  await page.request.get('/auth/sign-in');
}

// The app keeps fetching the user after the URL settles; drop those routes with the test.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

for (const [label, link, landing] of [
  [
    'plugin page',
    `/ui/none/plugins/${PLUGIN}?utm_source=owox.com`,
    `/ui/0/plugins/${PLUGIN}?utm_source=owox.com`,
  ],
  ['inner route', `/ui/none/plugins/${PLUGIN}/open/d/42`, `/ui/0/plugins/${PLUGIN}/open/d/42`],
] as const) {
  test.describe(`placeholder link to a ${label}`, () => {
    test('an unauthenticated visitor signs in without a project and lands in their own', async ({
      page,
    }) => {
      await page.route('**/auth/access-token', route => route.fulfill({ status: 401, body: '{}' }));
      await page.route('**/auth/sign-in**', route =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<p>sign-in stub</p>' })
      );

      await page.goto(link);
      await expect(page.getByText('sign-in stub')).toBeVisible();
      expect(page.url()).not.toContain('projectId=none');
      expect(await page.evaluate(key => sessionStorage.getItem(key), REDIRECT_KEY)).toBe(link);

      await openSession(page);
      await page.unroute('**/auth/access-token');
      await page.goto('/ui/0/data-marts');
      await expect(page).toHaveURL(new RegExp(`${landing.replace(/[?]/g, '\\?')}$`));
    });

    test('a member without roles is sent to request access with the link resolved', async ({
      page,
    }) => {
      await openSession(page);
      await page.route('**/auth/api/user**', async route => {
        const response = await route.fetch();
        const user = (await response.json()) as Record<string, unknown>;
        await route.fulfill({ response, json: { ...user, roles: [] } });
      });

      await page.goto(link);

      await expect(page).toHaveURL(/\/ui\/0\/request-access\?redirect-to=/);
      await expect.poll(() => new URL(page.url()).searchParams.get('redirect-to')).toBe(landing);
    });
  });
}
