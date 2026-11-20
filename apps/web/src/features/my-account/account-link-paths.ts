export const accountLinkRoutes = [
  { path: '/subscriptions', action: 'subscriptions' },
  { path: '/download-account-data', action: 'export' },
  // Keep the Angular Platform base path for a future host redirect of already-sent links.
  { path: '/ui/p/subscriptions', action: 'subscriptions' },
  { path: '/ui/p/download-account-data', action: 'export' },
] as const;

export function isAccountLinkPath(path: string): boolean {
  return accountLinkRoutes.some(({ path: value }) => path === value || path === `${value}/`);
}
