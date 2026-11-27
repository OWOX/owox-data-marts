import { expect, test } from '../fixtures/base';

const themeCases = [
  { preference: 'dark', colorScheme: 'light', expected: 'dark' },
  { preference: 'system', colorScheme: 'dark', expected: 'dark' },
  { preference: 'light', colorScheme: 'dark', expected: 'light' },
] as const;

for (const { preference, colorScheme, expected } of themeCases) {
  test(`renders the first App loader in ${expected} with ${preference} selected`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(selectedTheme => {
      localStorage.setItem('theme', selectedTheme);

      const observer = new MutationObserver(() => {
        if (!document.getElementById('root')?.textContent.includes('Loading application...')) {
          return;
        }

        // Observe the initial mount before React effects can update the theme.
        const { classList, dataset, style } = document.documentElement;
        dataset.bootstrapTheme =
          style.colorScheme && classList.contains(style.colorScheme) ? style.colorScheme : 'unset';
        observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }, preference);

    await page.route('**/auth/access-token', () => {
      // Keep the authentication request pending while the loader is visible.
    });
    await page.goto('/ui/0/data-marts');

    await expect(page.getByText('Loading application...', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-bootstrap-theme', expected);
  });
}
