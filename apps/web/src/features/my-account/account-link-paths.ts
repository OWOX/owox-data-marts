import { matchRoutes } from 'react-router';

export const accountLinkRoutes = [
  { path: '/subscriptions', action: 'subscriptions' },
  { path: '/download-account-data', action: 'export' },
  // Keep the Angular Platform base path for a future host redirect of already-sent links.
  { path: '/ui/p/subscriptions', action: 'subscriptions' },
  { path: '/ui/p/download-account-data', action: 'export' },
] as const;

const routePatterns = accountLinkRoutes.map(({ path }) => ({ path }));

export function isAccountLinkPath(path: string): boolean {
  return matchRoutes(routePatterns, path) !== null;
}
